import Panel from './Panel.js';
import Stat from './Stat.js';
import Chat from './chat/index.js';
import Vote from './Vote.js';
import Game from './Game.js';
import RTTManager from './RTTManager.js';
import TimerManager from './TimerManager.js';
import SnapshotManager from './SnapshotManager.js';
import Bots from './bots/index.js';
import ParticipantManager from '../player/ParticipantManager.js';
import VoteCoordinator from '../core/VoteCoordinator.js';
import RoundManager from '../core/RoundManager.js';
import CommandProcessor from '../core/CommandProcessor.js';
import { sanitizeMessage } from '../../lib/sanitizers.js';

// Singleton VIMP

let vimp;

class VIMP {
  constructor(data, socketManager) {
    if (vimp) {
      return vimp;
    }

    vimp = this;

    this._isDevMode = data.isDevMode || false; // флаг режима разработки

    this._mapList = Object.keys(data.maps); // список карт массивом (для parseVote)
    this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя
    this._maxPlayers = data.maxPlayers; // максимальное количество игроков

    this._idleTimeoutForPlayer = data.idleKickTimeout?.player || null;
    this._idleTimeoutForSpectator = data.idleKickTimeout?.spectator || null;

    // команды
    // team: teamId; { team1: 1, team2: 2, spectators: 3 }
    this._teams = data.teams;
    // название команды наблюдателя
    this._spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this._spectatorId = this._teams[this._spectatorTeam];

    // единый реестр участников (игроки + боты): источник истины
    this._participants = new ParticipantManager(
      this._teams,
      this._spectatorTeam,
      this._maxPlayers,
    );

    // инициализация сервисов
    this._game = new Game(
      data.parts,
      data.playerKeys,
      data.timers.timeStep / 1000,
    );
    this._panel = new Panel(data.panel);
    this._stat = new Stat(data.stat, this._teams);
    this._chat = new Chat();
    this._vote = new Vote();

    this._socketManager = socketManager;

    this._snapshotManager = new SnapshotManager(
      this._game,
      data.timers.networkSendRate,
    );

    this._bots = new Bots(
      this._participants,
      this._game,
      this._panel,
      this._stat,
    );

    this._RTTManager = new RTTManager(data.rtt, {
      onKickForMissedPings: gameId => this._kickForMissedPings(gameId),
      onKickForMaxLatency: gameId => this._kickForMaxLatency(gameId),
    });

    this._timerManager = new TimerManager(data.timers, {
      onMapTimeEnd: () => this._roundManager.onMapTimeEnd(),
      onRoundTimeEnd: () => this._roundManager.initiateNewRound(),
      onShotTick: dt => this._onShotTick(dt),
      onIdleCheck: () => this._kickIdleUsers(),
      onSendPing: () => this._sendPing(),
    });

    this._voteCoordinator = new VoteCoordinator({
      vote: this._vote,
      chat: this._chat,
      timerManager: this._timerManager,
    });

    this._roundManager = new RoundManager({
      participants: this._participants,
      game: this._game,
      panel: this._panel,
      stat: this._stat,
      chat: this._chat,
      socketManager: this._socketManager,
      timerManager: this._timerManager,
      bots: this._bots,
      voteCoordinator: this._voteCoordinator,
      snapshotManager: this._snapshotManager,
      teams: this._teams,
      spectatorTeam: this._spectatorTeam,
      spectatorId: this._spectatorId,
      maps: data.maps,
      mapList: this._mapList,
      mapsInVote: data.mapsInVote,
      mapScale: data.mapScale,
      mapSetId: data.mapSetId,
      currentMap: data.currentMap,
    });

    this._commandProcessor = new CommandProcessor({
      participants: this._participants,
      chat: this._chat,
      bots: this._bots,
      roundManager: this._roundManager,
      voteCoordinator: this._voteCoordinator,
      timerManager: this._timerManager,
      teams: this._teams,
      spectatorTeam: this._spectatorTeam,
      spectatorId: this._spectatorId,
      isDevMode: this._isDevMode,
    });

    // внедрение зависимостей
    this._socketManager.injectServices(this._game, this._panel, this._stat);
    this._game.injectServices({ vimp: this, panel: this._panel });
    this._panel.injectTimerManager(this._timerManager);

    this._timerManager.startIdleCheckTimer();

    this._roundManager.createMap();
  }

  // кикает за задержку в ответе на ping
  _kickForMaxLatency(gameId) {
    const user = this._participants.get(gameId);

    if (user) {
      console.warn(`[RTT] Kick ${user.name} — pong latency exceeded`);
      this._socketManager.close(user.socketId, 4003, 'kickForMaxLatency');
      this.removeUser(gameId);
    }
  }

  // кикает за превышение прокусков ответа на ping
  _kickForMissedPings(gameId) {
    const user = this._participants.get(gameId);

    if (user) {
      console.warn(`[RTT] Kick ${user.name} — no response to pings`);
      this._socketManager.close(user.socketId, 4004, 'kickForMissedPings');
      this.removeUser(gameId);
    }
  }

  // создает кадр игры
  _onShotTick(dt) {
    // обновление данных и физики
    this._game.updateData(dt);

    if (this._bots.getBotCount() > 0) {
      this._bots.updateBots(dt);
      this._bots.buildSpatialGrid(this._game.getAlivePlayers());
    }

    // получение снимка (snapshot)
    const gameSnapshot = this._snapshotManager.processTick();

    // если null, значит пока не время отправлять данные
    if (!gameSnapshot) {
      return;
    }

    // список пользователей готовых к игре
    const userList = this._participants.getNetworkedReady();
    const panelUpdates = this._panel.processUpdates();
    const stat = this._stat.getLast();
    const chat = this._chat.shift();
    const vote = this._vote.shift();

    gameSnapshot[this._roundManager.currentMapData.setId] =
      this._game.getDynamicMapData();

    // игроки для удаления с полотна
    const removedPlayersList = this._roundManager.removedPlayersList;

    while (removedPlayersList.length) {
      const user = removedPlayersList.pop();
      const model = user.model;

      gameSnapshot[model] = gameSnapshot[model] || {};
      gameSnapshot[model][user.gameId] = null;
    }

    const getUserData = gameId => {
      const user = this._participants.get(gameId);
      let coords, chatUser, voteUser;
      const panel = panelUpdates[gameId] || 0;
      const activeList = this._participants.getActiveList();

      if (user.isWatching === true) {
        // если есть играющие пользователи
        if (activeList.length) {
          // если наблюдаемый игрок не существует среди играющих
          if (!activeList.includes(user.watchedGameId)) {
            user.watchedGameId = activeList[0];
          }

          coords = this._game.getPosition(user.watchedGameId);
        } else {
          coords = [0, 0];
        }
      } else {
        coords = this._game.getPosition(gameId);
      }

      if (user.forceCameraReset === true) {
        coords[2] = true;
        user.forceCameraReset = false;
      }

      // передача данных для тряски (строка 'intensity:duration')
      if (user.pendingShake) {
        coords[3] = user.pendingShake;
        user.pendingShake = null;
      }

      // если общих сообщений нет
      if (!chat) {
        chatUser = this._chat.shiftByUser(gameId) || 0;
      } else {
        chatUser = chat;
      }

      // если общих данных для голосования нет
      if (!vote) {
        voteUser = this._vote.shiftByUser(gameId) || 0;
      } else {
        voteUser = vote;
      }

      return [gameSnapshot, coords, panel, stat, chatUser, voteUser];
    };

    // отправка данных
    userList.forEach(user =>
      this._socketManager.sendShot(user.socketId, getUserData(user.gameId)),
    );
  }

  // проверяет игроков на бездействие и кикает, если превышен порог
  _kickIdleUsers() {
    const now = Date.now();
    const usersToKick = [];

    for (const user of this._participants.getHumans()) {
      if (user.isReady !== true) {
        continue;
      }

      const idleThreshold =
        user.teamId === this._spectatorId
          ? this._idleTimeoutForSpectator
          : this._idleTimeoutForPlayer;

      if (idleThreshold !== null) {
        const idleTime = now - user.lastActionTime;

        if (idleTime > idleThreshold) {
          usersToKick.push(user);
        }
      }
    }

    // кик неактивных пользователей
    usersToKick.forEach(user => {
      this._socketManager.close(user.socketId, 4005, 'kickIdle');
      this.removeUser(user.gameId);
    });
  }

  // отправляет ping всем пользователям
  _sendPing() {
    const users = this._RTTManager.scheduleNextPing();

    for (const [gameId, { pingIdCounter }] of users) {
      const user = this._participants.get(gameId);

      this._socketManager.sendPing(user.socketId, pingIdCounter);
    }
  }

  // отправляет карту (прокси к RoundManager)
  sendMap(gameId) {
    this._roundManager.sendMap(gameId);
  }

  // сообщает о загрузке карты
  mapReady(gameId) {
    const user = this._participants.get(gameId);

    // если карта не актуальна
    if (user.currentMap !== this._roundManager.currentMap) {
      this.sendMap(gameId);
      return;
    }

    // если игрок ещё не готов
    if (user.isReady === false) {
      // отправка первого shot
      this._socketManager.sendFirstShot(user.socketId);
    }
  }

  // сообщает о готовности игрока к игре
  firstShotReady(gameId) {
    const user = this._participants.get(gameId);
    const socketId = user.socketId;

    user.isReady = true;
    this._socketManager.sendTechInform(socketId); // скрывает экран загрузки
    this._socketManager.sendFirstVote(socketId);
    this._chat.pushSystem('USER_JOINED', [user.name]);
  }

  // обрабатывает уничтожение игрока (прокси к RoundManager; вызывается из Game)
  reportKill(victimId, killerId = null) {
    this._roundManager.reportKill(victimId, killerId);
  }

  // меняет и возвращает gameId наблюдаемого игрока
  _getNextActivePlayerForUser(gameId, back) {
    const currentId = this._participants.get(gameId)?.watchedGameId;
    const activeList = this._participants.getActiveList();
    let key = activeList.indexOf(currentId);

    // если есть наблюдаемый игрок
    if (key !== -1) {
      // если поиск назад
      key = back ? key - 1 : key + 1;

      if (key < 0) {
        key = activeList.length - 1;
      } else if (key >= activeList.length) {
        key = 0;
      }

      return activeList[key];
    }

    return activeList[0] || null;
  }

  // активирует тряску камеры у игрока
  triggerCameraShake(gameId, shakeParams) {
    const user = this._participants.get(gameId);

    if (user) {
      user.pendingShake = `${shakeParams.intensity}:${shakeParams.duration}`;
    }
  }

  // создает нового игрока
  createUser(params, socketId, cb) {
    // запись участника (спектатор) в едином реестре
    const gameId = this._participants.createHuman(params, socketId);
    const name = this._participants.get(gameId).name;

    this._chat.addUser(gameId);
    this._vote.addUser(gameId);
    this._stat.addUser(gameId, this._spectatorId, { name });
    this._panel.addUser(gameId);
    this._RTTManager.addUser(gameId);

    process.nextTick(() => {
      cb(gameId);
    });
  }

  // удаляет игрока полностью из игры
  removeUser(gameId) {
    const user = this._participants.get(gameId);

    if (!user) {
      return;
    }

    const { team, teamId, model } = user;

    this._RTTManager.removeUser(gameId);
    this._stat.removeUser(gameId, teamId);
    this._chat.removeUser(gameId);
    this._vote.removeUser(gameId);
    this._panel.removeUser(gameId);

    // если не наблюдатель
    if (team !== this._spectatorTeam) {
      // удаление из модуля game
      this._game.removePlayer(gameId);

      // добавление в список удаляемых игроков у пользователей
      this._roundManager.removedPlayersList.push({
        gameId,
        model,
      });
    }

    // удаление из реестра (команда + список активных)
    this._participants.remove(gameId);

    this._chat.pushSystem('USER_LEFT', [user.name]);
  }

  // обновляет команды
  updateKeys(gameId, keyStr) {
    const user = this._participants.get(gameId);
    const [action, name] = keyStr.split(':');

    user.lastActionTime = Date.now();

    if (user.isWatching === true) {
      // если нажатие
      if (action === 'down') {
        // next player
        if (name === this._spectatorKeys.nextPlayer) {
          user.watchedGameId = this._getNextActivePlayerForUser(gameId);
          user.forceCameraReset = true;

          // prev player
        } else if (name === this._spectatorKeys.prevPlayer) {
          user.watchedGameId = this._getNextActivePlayerForUser(gameId, true);
          user.forceCameraReset = true;
        }
      }
    } else {
      this._game.updateKeys(gameId, { action, name });
    }
  }

  // добавляет сообщение
  pushMessage(gameId, message) {
    const user = this._participants.get(gameId);

    if (user.isReady === false) {
      return;
    }

    user.lastActionTime = Date.now();

    message = sanitizeMessage(message);

    if (message) {
      if (message.charAt(0) === '/') {
        this._commandProcessor.parseCommand(gameId, message);
      } else {
        this._chat.push(message, user.name, user.teamId);
      }
    }
  }

  // обрабатывает vote-данные пользователя
  parseVote(gameId, data) {
    const user = this._participants.get(gameId);

    if (user.isReady === false) {
      return;
    }

    user.lastActionTime = Date.now();

    // если данные 'строка' (запрос данных)
    if (typeof data === 'string') {
      // если запрос списка команд
      if (data === 'teams') {
        this._vote.pushByUser(gameId, Object.keys(this._teams));

        // если запрос всех карт
      } else if (data === 'maps') {
        this._vote.pushByUser(
          gameId,
          this._mapList.filter(map => map !== this._roundManager.currentMap),
        );
      }

      // если данные 'объект' (голосование пользователя)
    } else if (typeof data === 'object' && data !== null) {
      const [type, value] = data;

      // если пользователь захотел сменить карту
      if (type === 'mapChange') {
        // если пользователь один в игре (смена карты)
        if (this._participants.getHumans().length === 1) {
          this._roundManager.forceChangeMap(value);

          // иначе запуск голосования
        } else {
          this._roundManager.changeMap(gameId, value);
        }

        // иначе если смена статуса
      } else if (type === 'teamChange') {
        this._roundManager.changeTeam(gameId, value);
      } else {
        this._vote.addInVote(type, value);
        this._chat.pushSystemByUser(gameId, 'VOTE_ACCEPTED');
      }
    }
  }

  // обновляет значение round trip time
  updateRTT(gameId, pingId) {
    const latency = this._RTTManager.handlePong(gameId, pingId);

    if (latency !== null) {
      const user = this._participants.get(gameId);

      if (user) {
        this._stat.updateUser(gameId, user.teamId, { latency });
      }
    }
  }
}

export default VIMP;
