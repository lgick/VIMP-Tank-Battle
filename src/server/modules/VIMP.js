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
import { sanitizeMessage } from '../../lib/sanitizers.js';
import { isValidName } from '../../lib/validators.js';

// Singleton VIMP

let vimp;

class VIMP {
  constructor(data, socketManager) {
    if (vimp) {
      return vimp;
    }

    vimp = this;

    this._isDevMode = data.isDevMode || false; // флаг режима разработки

    this._maps = data.maps; // карты
    this._mapScale = data.mapScale;
    this._mapList = Object.keys(this._maps); // список карт массивом
    this._mapsInVote = data.mapsInVote; // карт в голосовании
    this._mapSetId = data.mapSetId; // дефолтный id конструктора карт
    this._currentMap = data.currentMap; // название текущей карты
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

    // список gameId игроков для удаления с полотна
    this._removedPlayersList = [];

    this._currentMapData = null; // данные текущей карты
    this._scaledMapData = null; // масштабированные данные текущей карты

    this._startMapNumber = 0; // номер первой карты в голосовании

    this._isRoundEnding = false; // флаг, если раунд процессе завершения

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
      onMapTimeEnd: () => this._onMapTimeEnd(),
      onRoundTimeEnd: () => this._initiateNewRound(),
      onShotTick: dt => this._onShotTick(dt),
      onIdleCheck: () => this._kickIdleUsers(),
      onSendPing: () => this._sendPing(),
    });

    // внедрение зависимостей
    this._socketManager.injectServices(this._game, this._panel, this._stat);
    this._game.injectServices({ vimp: this, panel: this._panel });
    this._panel.injectTimerManager(this._timerManager);

    this._timerManager.startIdleCheckTimer();

    this._createMap();
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

  // запускает голосование за смену карты
  _onMapTimeEnd() {
    this._resetVote();
    this._changeMap();
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

    gameSnapshot[this._currentMapData.setId] = this._game.getDynamicMapData();

    // игроки для удаления с полотна
    while (this._removedPlayersList.length) {
      const user = this._removedPlayersList.pop();
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

  // создает карту
  _createMap() {
    this._currentMapData = {
      scale: this._mapScale,
      ...this._maps[this._currentMap],
    };

    // масштабирование
    function scaleMapData(mapData) {
      const scale = mapData.scale;
      const step = mapData.step * scale;

      const physicsDynamic = (mapData.physicsDynamic || []).map(item => ({
        ...item,
        position: item.position.map(v => v * scale),
        width: item.width * scale,
        height: item.height * scale,
      }));

      const respawns = Object.fromEntries(
        Object.entries(mapData.respawns || {}).map(([team, arr]) => [
          team,
          arr.map(([x, y, angle]) => [x * scale, y * scale, angle]),
        ]),
      );

      return {
        ...mapData,
        step,
        physicsDynamic,
        respawns,
        scale,
      };
    }

    this._scaledMapData = scaleMapData(this._currentMapData);
    this._bots.createMap(this._scaledMapData);
    const botCounts = this._bots.getBotCountsPerTeam();
    this._bots.removeBots();
    this._bots.clearSpatialGrid();

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setId) {
      this._currentMapData.setId = this._mapSetId;
    }

    // остановка всех игровых таймеров и отложенных вызовов
    this._timerManager.stopGameTimers();

    this._participants.resetTeamSizes();

    this._participants.clearActive();
    this._removedPlayersList = [];

    this._panel.reset();
    this._stat.reset();
    this._resetVote();

    this._snapshotManager.reset();

    this._game.clear();
    this._game.createMap(this._scaledMapData);

    for (const user of this._participants.getHumans()) {
      const gameId = user.gameId;

      this._socketManager.sendClear(user.socketId);

      // перемещение пользователя в наблюдатели
      this._stat.moveUser(gameId, user.teamId, this._spectatorId);

      // обнулить параметры
      user.team = this._spectatorTeam;
      user.teamId = this._spectatorId;
      user.status = 'spectator';
      user.isWatching = true;
      user.watchedGameId = this._participants.getActiveList()[0] || null;
      user.forceCameraReset = true;

      this._participants.addToTeam(gameId, this._spectatorTeam);

      this.sendMap(gameId);
    }

    // воссоздание ботов на новой карте
    for (const [team, count] of Object.entries(botCounts)) {
      if (count > 0) {
        this._bots.createBots(count, team);
      }
    }

    this._timerManager.startGameTimers();
  }

  // отправляет карту
  sendMap(gameId) {
    const user = this._participants.get(gameId);
    const socketId = user.socketId;

    user.isReady = false;
    user.currentMap = this._currentMap;
    this._socketManager.sendTechInform(socketId, 'loading');
    this._socketManager.sendMap(socketId, this._currentMapData);
  }

  // сообщает о загрузке карты
  mapReady(gameId) {
    const user = this._participants.get(gameId);

    // если карта не актуальна
    if (user.currentMap !== this._currentMap) {
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

  // запуск нового раунда
  _initiateNewRound() {
    this._timerManager.stopRoundTimer();
    this._startRound();
    this._timerManager.startRoundTimer();
  }

  // начало раунда
  _startRound() {
    this._isRoundEnding = false; // сброс флага завершения раунда

    const respawns = this._scaledMapData.respawns;
    const respId = Object.keys(this._teams)
      .filter(key => key !== this._spectatorTeam)
      .reduce((acc, key) => ({ ...acc, [key]: 0 }), {});

    function getRespawnData(team) {
      const number = respId[team];

      respId[team] += 1;

      return respawns[team][number];
    }

    // очищение списка играющих
    this._participants.clearActive();

    this._panel.reset();

    const setIdList = this._game.removePlayersAndShots();

    this._game.createMap(this._scaledMapData);

    for (const user of this._participants.getHumans()) {
      if (user.isReady === false) {
        continue;
      }

      const socketId = user.socketId;
      const team = user.team;

      this._socketManager.sendClear(socketId, setIdList);

      if (team === this._spectatorTeam) {
        user.isWatching = true;
        user.forceCameraReset = true;
        this._socketManager.sendSpectatorDefaultShot(socketId);
      } else {
        this._setActivePlayer(user, getRespawnData(team));
      }

      this._socketManager.sendRoundStart(socketId);
    }

    // создание ботов на карте
    for (const botData of this._bots.getBots()) {
      this._setActivePlayer(botData, getRespawnData(botData.team));
    }
  }

  // меняет ник игрока
  _changeName(gameId, name) {
    const user = this._participants.get(gameId);
    const oldName = user.name;

    if (isValidName(name)) {
      name = this._participants.checkName(name);
      user.name = name;
      this._game.changeName(gameId, name);
      this._stat.updateUser(gameId, user.teamId, { name });
      this._chat.pushSystem('NAME_CHANGED', [oldName, name]);
      this._socketManager.sendName(user.socketId, name);
    } else {
      this._chat.pushSystemByUser(gameId, 'NAME_INVALID');
    }
  }

  // меняет команду игрока
  _changeTeam(gameId, newTeam) {
    const user = this._participants.get(gameId);
    const currentTeam = user.team;
    const respawns = this._scaledMapData.respawns;

    // если игрок выбирает свою текущую команду
    if (newTeam === currentTeam) {
      this._chat.pushSystemByUser(gameId, 'TEAMS_YOUR_TEAM', [newTeam]);
      return;
    }

    // если новая команда не наблюдатель и нет свободных респаунов
    if (
      newTeam !== this._spectatorTeam &&
      respawns[newTeam].length <= this._participants.getTeamSize(newTeam)
    ) {
      // попытка удалить одного бота, чтобы освободить место
      const botRemoved = this._bots.removeOneBotForPlayer(newTeam);

      if (!botRemoved) {
        this._chat.pushSystemByUser(gameId, 'TEAMS_TEAM_FULL', [
          newTeam,
          currentTeam,
        ]);

        return;
      }
    }

    // на этом этапе смена команды доступна
    this._participants.removeFromTeam(gameId, currentTeam);
    this._participants.addToTeam(gameId, newTeam);

    const oldTeamId = user.teamId;
    const newTeamId = this._teams[newTeam];

    user.team = newTeam;
    user.teamId = newTeamId;

    this._stat.moveUser(gameId, oldTeamId, newTeamId);

    // если активных игроков меньше 2-х, рестарт раунда
    if (
      this._participants
        .getHumans()
        .filter(u => u.teamId !== this._spectatorId && u.gameId !== gameId)
        .length < 2
    ) {
      this._stat.reset();
      this._initiateNewRound();
      this._chat.pushSystemByUser(gameId, 'TEAMS_NEW_TEAM', [newTeam]);
      return;
    }

    // если переход из активного игрока в наблюдатели
    if (newTeamId === this._spectatorId) {
      this._setSpectatorFromActivePlayer(user);
      this._chat.pushSystemByUser(gameId, 'TEAMS_NOW_SPECTATOR');
      return;
    }

    // сообщение о смене команды
    this._chat.pushSystemByUser(gameId, 'TEAMS_NEW_TEAM', [newTeam]);

    // если игра активным игроком невозможна в текущем раунде
    if (!this._timerManager.canChangeTeamInCurrentRound()) {
      this._stat.updateUser(gameId, newTeamId, {
        status: 'dead',
      });

      // если пользователь был активным игроком,
      // перевести его в наблюдатели до следующего раунда
      if (oldTeamId !== this._spectatorId) {
        this._setSpectatorFromActivePlayer(user);
      }
      // игра активным игроком возможна в текущем раунде
    } else {
      const respawnIndex = this._participants.getTeamSize(newTeam) - 1;
      const respawnData = respawns[newTeam][respawnIndex];

      // переход из наблюдателя в игрока
      if (oldTeamId === this._spectatorId) {
        this._setActivePlayer(user, respawnData);
        // смена игровой команды
      } else {
        this._game.changePlayerData(gameId, {
          respawnData,
          teamId: newTeamId,
          gameId,
        });
      }
    }
  }

  // перевод активного игрока в наблюдатели
  _setSpectatorFromActivePlayer(user) {
    const gameId = user.gameId;
    const model = user.model;

    user.status = 'spectator';
    user.isWatching = true;
    user.watchedGameId = this._participants.getActiveList()[0] || null;
    user.forceCameraReset = true;

    this._participants.removeActive(gameId);
    this._removedPlayersList.push({ gameId, model });
    this._game.removePlayer(gameId);
    this._socketManager.sendSpectatorDefaultShot(user.socketId);
  }

  // перевод игрока в активные игроки
  _setActivePlayer(user, respawnData) {
    const gameId = user.gameId;
    const teamId = user.teamId;
    const name = user.name;
    const model = user.model;

    user.status = 'active';
    user.isWatching = false;
    user.watchedGameId = null;
    user.forceCameraReset = true;

    // если это реальный игрок (есть сокет)
    if (user.isNetworked) {
      this._socketManager.sendPlayerDefaultShot(user.socketId, gameId);
    }

    this._stat.updateUser(gameId, teamId, { status: '' });
    this._game.createPlayer(gameId, model, name, teamId, respawnData);
    this._participants.addActive(gameId);
  }

  // проверяет уничтожение всей команды
  _checkTeamWipe(victimTeamId, killerTeamId) {
    // если раунд уже в процессе завершения
    if (this._isRoundEnding) {
      return;
    }

    let winnerTeam = null;

    // если команда наблюдателей, проверка не требуется
    if (victimTeamId === this._spectatorId) {
      return;
    }

    // проверка на живых участников в команде (игроки и боты)
    for (const participant of this._participants.getAll()) {
      // если нашелся живой участник, команда не уничтожена
      if (
        participant.teamId === victimTeamId &&
        this._game.isAlive(participant.gameId)
      ) {
        return;
      }
    }

    // активация флага завершения раунда
    this._isRoundEnding = true;

    // запись поражения команде
    this._stat.updateHead(victimTeamId, 'deaths', 1);

    // если убийца из другой команды, фраг для команды-победителя
    if (killerTeamId && killerTeamId !== victimTeamId) {
      this._stat.updateHead(killerTeamId, 'score', 1);

      winnerTeam = Object.keys(this._teams).find(
        key => this._teams[key] === killerTeamId,
      );
    }

    if (winnerTeam) {
      this._participants.getHumans().forEach(user => {
        const socketId = user.socketId;

        if (user.teamId === victimTeamId) {
          this._socketManager.sendDefeat(socketId);
        } else {
          this._socketManager.sendVictory(socketId);
        }

        this._socketManager.sendRoundEnd(socketId, winnerTeam);
      });
    } else {
      this._participants.getHumans().forEach(user => {
        const socketId = user.socketId;

        this._socketManager.sendDefeat(socketId);
        this._socketManager.sendRoundEnd(socketId);
      });
    }

    this._timerManager.stopRoundTimer();
    this._timerManager.startRoundRestartDelay(); // отложенный перезапуск раунда
  }

  // обрабатывает уничтожение игрока, обновляет статистику
  reportKill(victimId, killerId = null) {
    const victimUser = this._participants.get(victimId);

    if (!victimUser) {
      return;
    }

    victimUser.status = 'dead';
    victimUser.isWatching = true;
    this._stat.updateUser(victimId, victimUser.teamId, {
      deaths: 1,
      status: 'dead',
    });

    // отмена всех запланированных обновлений панели
    this._panel.invalidate(victimId);

    if (victimUser.isNetworked) {
      this._socketManager.sendSpectatorDefaultShot(victimUser.socketId);
      this._socketManager.sendGameOverSound(victimUser.socketId);
    }

    if (killerId) {
      const killerUser = this._participants.get(killerId);

      // если это не самоубийство
      if (victimId !== killerId) {
        // отслеживание противника
        victimUser.watchedGameId = killerId;
        victimUser.forceCameraReset = true;

        // если кто-то наблюдал за victimId — переназначить на killerId
        this._participants.replaceWatched(victimId, killerId);

        // если это не убийство игрока своей команды
        if (victimUser.teamId !== killerUser.teamId) {
          this._stat.updateUser(killerId, killerUser.teamId, { score: 1 });
          // иначе если это огонь по своим
        } else {
          this._stat.updateUser(killerId, killerUser.teamId, { score: -1 });
        }

        if (killerUser.isNetworked) {
          this._socketManager.sendFragSound(killerUser.socketId);
        }
      }

      this._chat.pushSystem('REPORT_KILL', [killerUser.name, victimUser.name]);

      // проверка на уничтожение всей команды противника
      this._checkTeamWipe(victimUser.teamId, killerUser.teamId);
    }
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
      this._removedPlayersList.push({
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
        this._parseCommand(gameId, message);
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
          this._mapList.filter(map => map !== this._currentMap),
        );
      }

      // если данные 'объект' (голосование пользователя)
    } else if (typeof data === 'object' && data !== null) {
      const [type, value] = data;

      // если пользователь захотел сменить карту
      if (type === 'mapChange') {
        // если пользователь один в игре (смена карты)
        if (this._participants.getHumans().length === 1) {
          this._currentMap = value;
          this._createMap();

          // иначе запуск голосования
        } else {
          this._changeMap(gameId, value);
        }

        // иначе если смена статуса
      } else if (type === 'teamChange') {
        this._changeTeam(gameId, value);
      } else {
        this._vote.addInVote(type, value);
        this._chat.pushSystemByUser(gameId, 'VOTE_ACCEPTED');
      }
    }
  }

  // возвращает список карт для голосования
  _getMapList() {
    if (this._mapList.length <= this._mapsInVote) {
      return this._mapList;
    }

    let endNumber = this._startMapNumber + this._mapsInVote;
    let maps = this._mapList.slice(this._startMapNumber, endNumber);

    if (maps.length < this._mapsInVote) {
      endNumber = this._mapsInVote - maps.length;
      maps = maps.concat(this._mapList.slice(0, endNumber));
    }

    this._startMapNumber = endNumber;

    return maps;
  }

  // отправляет голосование за новую карту
  _changeMap(gameId, mapName) {
    const voteCategory = 'mapChange';

    if (!this._canCreateVote(voteCategory, gameId)) {
      return;
    }

    // если есть gameId и карта (голосование создает пользователь)
    if (typeof gameId !== 'undefined' && typeof mapName === 'string') {
      const voteName = 'mapChangeByUser';

      const userName = this._participants.get(gameId).name;
      const userList = this._participants
        .getHumans()
        .map(u => u.gameId)
        .filter(id => id !== gameId);
      const payload = { name: voteName, params: [userName, mapName] };

      this._createVote({
        voteName,
        voteCategory,
        payload,
        resultFunc: result => {
          if (result === 'Yes' && this._maps[mapName]) {
            this._chat.pushSystem('VOTE_PASSED');
            this._chat.pushSystem('MAP_NEXT', [mapName]);
            this._timerManager.startMapChangeDelay(() => {
              this._currentMap = mapName;
              this._createMap();
            });
          } else {
            this._chat.pushSystem('VOTE_FAILED');
          }
        },
        userList,
        gameId,
      });

      // иначе голосование создает игра
    } else {
      const voteName = 'mapChangeBySystem';

      const mapList = this._getMapList(); // список карт

      const payload = { name: voteName, values: mapList };

      this._createVote({
        voteName,
        voteCategory,
        payload,
        resultFunc: resultingMapName => {
          if (resultingMapName && this._maps[resultingMapName]) {
            this._chat.pushSystem('VOTE_PASSED');
            this._chat.pushSystem('MAP_NEXT', [resultingMapName]);
            this._timerManager.startMapChangeDelay(() => {
              this._currentMap = resultingMapName;
              this._createMap();
            });
          } else {
            // если никто не проголосовал, продлеваем время текущей карты
            this._timerManager.stopMapTimer();
            this._timerManager.startMapTimer();
            this._chat.pushSystem('VOTE_FAILED');
            this._chat.pushSystem('MAP_CURRENT', [this._currentMap]);
          }
        },
      });
    }
  }

  // обрабатывает команду от пользователя
  _parseCommand(gameId, message) {
    message = message.replace(/\s\s+/g, ' ');

    const arr = message.split(' ');
    const cmd = arr.shift();

    switch (cmd) {
      // смена ника
      case '/name':
        this._changeName(gameId, arr.join(' '));
        break;

      // новый раунд
      case '/nr':
        if (this._isDevMode) {
          this._initiateNewRound();
        } else {
          this._chat.pushSystemByUser(gameId, 'COMMANDS_NOT_FOUND');
        }
        break;

      // время карты
      case '/timeleft': {
        function getTime(ms) {
          const totalSeconds = Math.floor(ms / 1000);
          let minutes = Math.floor(totalSeconds / 60);
          let seconds = totalSeconds % 60;

          if (minutes < 10) {
            minutes = '0' + minutes;
          }

          if (seconds < 10) {
            seconds = '0' + seconds;
          }

          return `${minutes}:${seconds}`;
        }

        this._chat.pushSystemByUser(gameId, [
          getTime(this._timerManager.getMapTimeLeft()),
        ]);
        break;
      }

      // название текущей карты
      case '/mapname':
        this._chat.pushSystemByUser(gameId, [this._currentMap]);
        break;

      // управление ботами
      // /bot 5 team1     # создаёт 5 ботов в team1
      // /bot 3 team2     # создаёт 3 бота в team2
      // /bot 10          # создаёт 10 ботов, распределив их равномерно
      // /bot 0           # удаляет всех ботов
      case '/bot': {
        const user = this._participants.get(gameId);

        if (user.teamId === this._spectatorId) {
          this._chat.pushSystemByUser(gameId, 'BOT_PLAYERS_ONLY');
          break;
        }

        const count = parseInt(arr[0], 10);
        const team = arr[1] || null;

        if (isNaN(count) || count < 0) {
          this._chat.pushSystemByUser(gameId, 'BOT_INVALID_COUNT');
          break;
        }

        // если команда не соответствует
        if (team && (!this._teams[team] || team === this._spectatorTeam)) {
          this._chat.pushSystemByUser(gameId, 'BOT_INVALID_TEAM');
          break;
        }

        // если команда на удаление ботов, но удалять нечего
        if (count === 0) {
          if (team && this._bots.getBotCountForTeam(team) === 0) {
            this._chat.pushSystemByUser(gameId, 'BOT_REMOVED_FROM_TEAM', [
              team,
            ]);
            break;
          }

          if (this._bots.getBotCount() === 0) {
            this._chat.pushSystemByUser(gameId, 'BOT_REMOVED');
            break;
          }
        }

        // проверка количества активных игроков
        const activePlayerCount = this._participants
          .getHumans()
          .filter(u => u.teamId !== this._spectatorId).length;

        // если игрок один, выполнение команды
        if (activePlayerCount <= 1) {
          this._executeBotCommand(user.name, count, team);
          // иначе игроков больше, запуск голосования
        } else {
          this._initiateBotVote(gameId, count, team);
        }
        break;
      }

      default:
        this._chat.pushSystemByUser(gameId, 'COMMANDS_NOT_FOUND');
    }
  }

  // исполняет команду /bot
  _executeBotCommand(userName, count, team) {
    if (team) {
      this._bots.removeBots(team);

      if (count > 0) {
        count = this._bots.createBots(count, team);
        this._chat.pushSystem('BOT_CREATED_FOR_TEAM', [count, team]);
      } else {
        this._chat.pushSystem('BOT_REMOVED_FROM_TEAM', [team]);
      }
    } else {
      this._bots.removeBots();

      if (count > 0) {
        count = this._bots.createBots(count, null);
        this._chat.pushSystem('BOT_CREATED', [count]);
      } else {
        this._chat.pushSystem('BOT_REMOVED');
      }
    }

    this._initiateNewRound();
  }

  // инициирует голосование за ботов
  _initiateBotVote(gameId, count, team) {
    const userName = this._participants.get(gameId).name;
    const voteCategory = 'botManagement';
    let voteName;
    let voteArgs;

    if (!this._canCreateVote(voteCategory, gameId)) {
      return;
    }

    if (team) {
      if (count > 0) {
        voteName = 'createBotsForTeam';
        voteArgs = [userName, count, team];
      } else {
        voteName = 'removeBotsForTeam';
        voteArgs = [userName, team];
      }
    } else {
      if (count > 0) {
        voteName = 'createBots';
        voteArgs = [userName, count];
      } else {
        voteName = 'removeBots';
        voteArgs = [userName];
      }
    }

    const payload = { name: voteName, params: voteArgs };
    const userList = this._participants
      .getHumans()
      .map(u => u.gameId)
      .filter(id => id !== gameId);

    this._createVote({
      voteName,
      voteCategory,
      payload,
      resultFunc: result => {
        if (result === 'Yes') {
          this._chat.pushSystem('VOTE_PASSED');
          this._executeBotCommand(userName, count, team);
        } else {
          this._chat.pushSystem('VOTE_FAILED');
        }
      },
      userList,
      gameId,
    });
  }

  // проверяет возможность создать голосование
  _canCreateVote(voteCategory, gameId) {
    // если голосование в данной категории заблокировано
    // или уже было создано в vote
    if (
      this._timerManager.isVoteBlocked(voteCategory) ||
      this._vote.hasVoteCategory(voteCategory)
    ) {
      if (gameId) {
        this._chat.pushSystemByUser(gameId, 'VOTE_UNAVAILABLE');
      }

      return false;
    }

    return true;
  }

  // создаёт опрос
  _createVote(data) {
    const { voteName, voteCategory, payload, resultFunc, userList, gameId } =
      data;

    // если голосование инициировано пользователем
    if (gameId) {
      this._chat.pushSystemByUser(gameId, 'VOTE_CREATED');
    }

    const onStart = () => {
      if (gameId) {
        this._chat.pushSystemByUser(gameId, 'VOTE_STARTED');
        this._vote.addInVote(voteName, 'Yes');
      }

      // таймер на сбор результатов
      this._timerManager.startVoteTimer(voteName, () => {
        // таймер временной блокировки повторного голосования
        this._timerManager.startVoteBlockTimer(voteCategory, () => {});

        const result = this._vote.getResult(voteName);

        resultFunc(result);
      });
    };

    this._vote.createVote({
      name: voteName,
      category: voteCategory,
      payload,
      userList,
      onStartCallback: onStart,
    });
  }

  // сбрасывает активные и запланированные опросы и таймеры по ним
  _resetVote() {
    this._timerManager.stopAllVoteTimers();
    this._timerManager.stopAllBlockedVoteTimers();
    this._vote.reset();
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
