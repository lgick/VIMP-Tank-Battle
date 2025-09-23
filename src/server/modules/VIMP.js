import Panel from './Panel.js';
import Stat from './Stat.js';
import Chat from './chat/index.js';
import Vote from './Vote.js';
import Game from './Game.js';
import RTTManager from './RTTManager.js';
import TimerManager from './TimerManager.js';
import BotManager from './BotManager.js';
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

    this._idleTimeoutForPlayer = data.idleKickTimeout?.player || null;
    this._idleTimeoutForSpectator = data.idleKickTimeout?.spectator || null;

    this._users = {}; // игроки

    // команды
    // team: teamId; { team1: 1, team2: 2, spectators: 3 }
    this._teams = data.teams;
    // название команды наблюдателя
    this._spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this._spectatorId = this._teams[this._spectatorTeam];
    // количество игроков в командах
    // { team1: new Set(), team2: new Set(), spectators: new Set() }
    this._teamSizes = {};

    // список gameId активных игроков на полотне для наблюдения
    // (кроме убитых игроков)
    this._activePlayersList = [];
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

    this._botManager = new BotManager(
      this,
      this._game,
      this._panel,
      this._stat,
    );

    this._RTTManager = new RTTManager(data.rtt, {
      onKickForMissedPings: gameId => this.kickForMissedPings(gameId),
      onKickForMaxLatency: gameId => this.kickForMaxLatency(gameId),
    });

    this._timerManager = new TimerManager(data.timers, {
      onMapTimeEnd: () => this.onMapTimeEnd(),
      onRoundTimeEnd: () => this.initiateNewRound(),
      onShotTick: dt => this.onShotTick(dt),
      onIdleCheck: () => this.kickIdleUsers(),
      onSendPing: () => this.sendPing(),
    });

    // внедрение зависимостей
    this._socketManager.injectServices(this._game, this._panel, this._stat);
    this._game.injectServices({ vimp: this, panel: this._panel });
    this._panel.injectTimerManager(this._timerManager);

    this._timerManager.startIdleCheckTimer();

    this.createMap();
  }

  // кикает за задержку в ответе на ping
  kickForMaxLatency(gameId) {
    const user = this._users[gameId];

    if (user) {
      console.warn(`[RTT] Kick ${user.name} — pong latency exceeded`);
      this._socketManager.close(user.socketId, 4003, 'kickForMaxLatency');
      this.removeUser(gameId);
    }
  }

  // кикает за превышение прокусков ответа на ping
  kickForMissedPings(gameId) {
    const user = this._users[gameId];

    if (user) {
      console.warn(`[RTT] Kick ${user.name} — no response to pings`);
      this._socketManager.close(user.socketId, 4004, 'kickForMissedPings');
      this.removeUser(gameId);
    }
  }

  // запускает голосование за смену карты
  onMapTimeEnd() {
    this._resetVote();
    this.changeMap();
  }

  // создает кадр игры
  onShotTick(dt) {
    // обновление данных и физики
    this._game.updateData(dt);

    // список пользователей готовых к игре
    const userList = Object.values(this._users).filter(
      user => user.isReady === true,
    );

    const game = this._game.getGameData();
    const panelUpdates = this._panel.processUpdates();
    const stat = this._stat.getLast();
    const chat = this._chat.shift();
    const vote = this._vote.shift();

    game[this._currentMapData.setId] = this._game.getDynamicMapData();

    // игроки для удаления с полотна
    while (this._removedPlayersList.length) {
      const user = this._removedPlayersList.pop();
      const model = user.model;

      game[model] = game[model] || {};
      game[model][user.gameId] = null;
    }

    const getUserData = gameId => {
      const user = this._users[gameId];
      let coords, chatUser, voteUser;
      const panel = panelUpdates[gameId] || 0;

      if (user.isWatching === true) {
        // если есть играющие пользователи
        if (this._activePlayersList.length) {
          // если наблюдаемый игрок не существует (завершил игру)
          if (!this._users[user.watchedGameId]) {
            user.watchedGameId = this._activePlayersList[0];
          }

          coords = this._game.getPosition(user.watchedGameId);
        } else {
          coords = [0, 0, 0];
        }
      } else {
        coords = this._game.getPosition(gameId);
      }

      // если у игрока активен эффект тряски камеры
      if (user.shakeDuration > 0) {
        // расчёт текущей интенсивности с затуханием
        const currentIntensity =
          user.shakeIntensity * (user.shakeDuration / user.shakeTotalDuration);

        // случайное смещение
        const offsetX = (Math.random() - 0.5) * 2 * currentIntensity;
        const offsetY = (Math.random() - 0.5) * 2 * currentIntensity;

        coords[0] += offsetX;
        coords[1] += offsetY;

        // оставшаяся длительность
        // dt в секундах, duration в мс
        user.shakeDuration -= dt * 1000;

        if (user.shakeDuration <= 0) {
          user.shakeDuration = 0;
          user.shakeIntensity = 0;
          user.shakeTotalDuration = 0;
        }
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

      return [game, coords, panel, stat, chatUser, voteUser];
    };

    // отправка данных
    userList.forEach(user =>
      this._socketManager.sendShot(user.socketId, getUserData(user.gameId)),
    );
  }

  // проверяет игроков на бездействие и кикает, если превышен порог
  kickIdleUsers() {
    const now = Date.now();
    const usersToKick = [];

    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

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
    }

    // кик неактивных пользователей
    usersToKick.forEach(user => {
      this._socketManager.close(user.socketId, 4005, 'kickIdle');
      this.removeUser(user.gameId);
    });
  }

  // отправляет ping всем пользователям
  sendPing() {
    const users = this._RTTManager.scheduleNextPing();

    for (const [gameId, { pingIdCounter }] of users) {
      const user = this._users[gameId];

      this._socketManager.sendPing(user.socketId, pingIdCounter);
    }
  }

  // создает карту
  createMap() {
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
    this._botManager.createMap(this._scaledMapData);
    const botCounts = this._botManager.getBotCountsPerTeam();
    this._botManager.removeBots();

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setId) {
      this._currentMapData.setId = this._mapSetId;
    }

    // остановка всех игровых таймеров и отложенных вызовов
    this._timerManager.stopGameTimers();

    this.resetTeamSizes();

    this._activePlayersList = [];
    this._removedPlayersList = [];

    this._panel.reset();
    this._stat.reset();
    this._resetVote();

    this._game.clear();
    this._game.createMap(this._scaledMapData);

    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

        this._socketManager.sendClear(user.socketId);

        // перемещение пользователя в наблюдатели
        this._stat.moveUser(gameId, user.teamId, this._spectatorId);

        // обнулить параметры
        user.team = this._spectatorTeam;
        user.teamId = this._spectatorId;
        user.isWatching = true;
        user.watchedGameId = this._activePlayersList[0] || null;

        this._teamSizes[this._spectatorTeam].add(gameId);

        this.sendMap(gameId);
      }
    }

    // воссоздание ботов на новой карте
    for (const [team, count] of Object.entries(botCounts)) {
      if (count > 0) {
        this._botManager.createBots(count, team);
      }
    }

    this._timerManager.startGameTimers();
  }

  // отправляет карту
  sendMap(gameId) {
    const user = this._users[gameId];
    const socketId = user.socketId;

    user.isReady = false;
    user.currentMap = this._currentMap;
    this._socketManager.sendTechInform(socketId, 'sendMap');
    this._socketManager.sendMap(socketId, this._currentMapData);
  }

  // сообщает о загрузке карты
  mapReady(gameId) {
    const user = this._users[gameId];

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
    const user = this._users[gameId];
    const socketId = user.socketId;

    user.isReady = true;
    this._socketManager.sendTechInform(socketId); // скрывает экран загрузки
    this._socketManager.sendFirstVote(socketId);
  }

  // запуск нового раунда
  initiateNewRound() {
    this._timerManager.stopRoundTimer();
    this.startRound();
    this._timerManager.startRoundTimer();
  }

  // начало раунда
  startRound() {
    this._isRoundEnding = false; // сброс флага завершения раунда

    const respawns = this._scaledMapData.respawns;
    const respId = {};

    // очищение списка играющих
    this._activePlayersList = [];

    this._panel.reset();

    const setIdList = this._game.removePlayersAndShots();

    this._game.createMap(this._scaledMapData);

    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

        if (user.isReady === false) {
          continue;
        }

        const socketId = user.socketId;
        const team = user.team;

        this._socketManager.sendClear(socketId, setIdList);

        if (team === this._spectatorTeam) {
          user.isWatching = true;
          this._socketManager.sendSpectatorDefaultShot(socketId);
        } else {
          respId[team] = respId[team] || 0;

          const respArr = respawns[team];
          const respawnData = respArr[respId[team]];

          this._setActivePlayer(user, respawnData);

          respId[team] += 1;
        }

        this._socketManager.sendRoundStart(socketId);
      }
    }

    // создание ботов на карте
    for (const [botId, botData] of this._botManager.getBots()) {
      const team = botData.team;
      const respArr = respawns[team];

      respId[team] = respId[team] || 0;

      if (respArr && respId[team] < respArr.length) {
        this._game.createPlayer(
          botId,
          botData.model,
          botData.name,
          botData.teamId,
          respArr[respId[team]],
        );

        respId[team] += 1;
      }
    }
  }

  // проверяет имя
  checkName(name, number = 1) {
    for (const p in this._users) {
      if (Object.hasOwn(this._users, p)) {
        if (this._users[p].name === name) {
          if (number > 1) {
            name = name.slice(0, name.lastIndexOf('#')) + '#' + number;
          } else {
            name = name + '#' + number;
          }

          return this.checkName(name, number + 1);
        }
      }
    }

    return name;
  }

  // меняет ник игрока
  changeName(gameId, name) {
    const user = this._users[gameId];
    const oldName = user.name;

    if (isValidName(name)) {
      name = this.checkName(name);
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
  changeTeam(gameId, newTeam) {
    const user = this._users[gameId];
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
      respawns[newTeam].length <= this._teamSizes[newTeam].size
    ) {
      // попытка удалить одного бота, чтобы освободить место
      const botRemoved = this._botManager.removeOneBotForPlayer(newTeam);

      if (!botRemoved) {
        this._chat.pushSystemByUser(gameId, 'TEAMS_TEAM_FULL', [
          newTeam,
          currentTeam,
        ]);

        return;
      }
    }

    // на этом этапе смена команды доступна
    this._teamSizes[currentTeam].delete(gameId);
    this._teamSizes[newTeam].add(gameId);

    const oldTeamId = user.teamId;
    const newTeamId = this._teams[newTeam];

    user.team = newTeam;
    user.teamId = newTeamId;

    this._stat.moveUser(gameId, oldTeamId, newTeamId);

    // если активных игроков меньше 2-х, рестарт раунда
    if (
      Object.keys(this._users).filter(
        id => this._users[id].teamId !== this._spectatorId && id !== gameId,
      ).length < 2
    ) {
      this._stat.reset();
      this.initiateNewRound();
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
      const respawnIndex = this._teamSizes[newTeam].size - 1;
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

    user.isWatching = true;
    user.watchedGameId = this._activePlayersList[0] || null;

    this.removeFromActivePlayers(gameId);
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

    user.isWatching = false;
    user.watchedGameId = null;

    this._socketManager.sendPlayerDefaultShot(user.socketId, gameId);
    this._stat.updateUser(gameId, teamId, { status: '' });
    this._game.createPlayer(gameId, model, name, teamId, respawnData);
    this.addToActivePlayers(gameId);
  }

  // сбрасывает this._teamSizes в нулевые значения
  resetTeamSizes() {
    this._teamSizes = Object.keys(this._teams).reduce((acc, key) => {
      acc[key] = new Set();
      return acc;
    }, {});
  }

  // добавляет в список играющих пользователей
  addToActivePlayers(gameId) {
    if (!this._activePlayersList.includes(gameId)) {
      this._activePlayersList.push(gameId);
    }
  }

  // удаляет из списка играющих пользователей
  removeFromActivePlayers(gameId) {
    this._activePlayersList = this._activePlayersList.filter(
      id => id !== gameId,
    );

    // удаление из watchedGameId других игроков
    for (const p in this._users) {
      if (Object.hasOwn(this._users, p)) {
        if (this._users[p].watchedGameId === gameId) {
          this._users[p].watchedGameId = this._activePlayersList[0] || null;
        }
      }
    }
  }

  // проверяет уничтожение всей команды
  checkTeamWipe(victimTeamId, killerTeamId) {
    // если раунд уже в процессе завершения
    if (this._isRoundEnding) {
      return;
    }

    let winnerTeam = null;

    // если команда наблюдателей, проверка не требуется
    if (victimTeamId === this._spectatorId) {
      return;
    }

    // проверка на живых игроков в команде
    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

        // если нашелся живой игрок, команда не уничтожена
        if (user.teamId === victimTeamId && !user.isWatching) {
          return;
        }
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
      Object.keys(this._users).forEach(gameId => {
        const user = this._users[gameId];
        const socketId = user.socketId;

        if (user.teamId === victimTeamId) {
          this._socketManager.sendDefeat(socketId);
        } else {
          this._socketManager.sendVictory(socketId);
        }

        this._socketManager.sendRoundEnd(socketId, winnerTeam);
      });
    } else {
      Object.values(this._users).forEach(user => {
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
    const victimUser = this._users[victimId];

    if (!victimUser || victimUser.isWatching) {
      return;
    }

    victimUser.isWatching = true;
    this.removeFromActivePlayers(victimId);

    // обновление статистики уничтоженного игрока
    this._stat.updateUser(victimId, victimUser.teamId, {
      deaths: 1,
      status: 'dead',
    });

    const killerUser = this._users[killerId];

    // если это не самоубийство
    if (killerUser && victimId !== killerId) {
      // если это не убийство игрока своей команды
      if (victimUser.teamId !== killerUser.teamId) {
        this._stat.updateUser(killerId, killerUser.teamId, { score: 1 });
        // иначе если это огонь по своим
      } else {
        this._stat.updateUser(killerId, killerUser.teamId, { score: -1 });
      }

      this._socketManager.sendFragSound(killerUser.socketId);
    }

    // отмена всех запланированных обновлений панели
    this._panel.invalidate(victimId);

    this._socketManager.sendSpectatorDefaultShot(victimUser.socketId);

    // проверка на уничтожение всей команды противника
    this.checkTeamWipe(
      victimUser.teamId,
      killerUser ? killerUser.teamId : null,
    );
  }

  // меняет и возвращает gameId наблюдаемого игрока
  getNextActivePlayerForUser(gameId, back) {
    const currentId = this._users[gameId]?.watchedGameId;
    let key = this._activePlayersList.indexOf(currentId);

    // если есть наблюдаемый игрок
    if (key !== -1) {
      // если поиск назад
      key = back ? key - 1 : key + 1;

      if (key < 0) {
        key = this._activePlayersList.length - 1;
      } else if (key >= this._activePlayersList.length) {
        key = 0;
      }

      return this._activePlayersList[key];
    }

    return this._activePlayersList[0] || null;
  }

  // запускает тряску камеры у игрока
  triggerCameraShake(gameId, shakeParams) {
    const user = this._users[gameId];

    if (user) {
      user.shakeIntensity = shakeParams.intensity;
      user.shakeDuration = shakeParams.duration;
      user.shakeTotalDuration = shakeParams.duration;
    }
  }

  // создает нового игрока
  createUser(params, socketId, cb) {
    // подбирает gameId
    const getGameId = () => {
      let counter = 0;

      while (this._users[counter.toString(10)]) {
        counter += 1;
      }
      return counter.toString(10);
    };

    const gameId = getGameId();
    const name = this.checkName(params.name);

    // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
    this._users[gameId] = {
      // gameId игрока
      gameId,
      // socketId игрока, для ws коммуникации
      socketId,
      // флаг готовности игрока
      isReady: false,
      // текущая карта игры
      currentMap: null,
      // имя пользователя
      name,
      // модель игрока
      model: params.model,
      // название команды
      team: this._spectatorTeam,
      // id команды
      teamId: this._spectatorId,
      // флаг наблюдателя за игрой
      // (true у игроков, которые в текущий момент наблюдают за игрой)
      isWatching: true,
      // id наблюдаемого игрока
      watchedGameId: this._activePlayersList[0] || null,
      // текущая интенсивность тряски камеры
      shakeIntensity: 0,
      // оставшаяся длительность тряски камеры
      shakeDuration: 0,
      // общая длительность тряски для расчета затухания
      shakeTotalDuration: 0,
      // фиксация времени активности пользователя
      lastActionTime: Date.now(),
    };

    this._chat.addUser(gameId);
    this._vote.addUser(gameId);
    this._stat.addUser(gameId, this._spectatorId, { name });
    this._panel.addUser(gameId);
    this._RTTManager.addUser(gameId);

    this._teamSizes[this._spectatorTeam].add(gameId);

    process.nextTick(() => {
      cb(gameId);
      this.sendMap(gameId);
    });
  }

  // удаляет игрока полностью из игры
  removeUser(gameId) {
    const user = this._users[gameId];

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
      // удаляем из модуля game
      this._game.removePlayer(gameId);

      // удаляем из списка играющих на полотне
      this.removeFromActivePlayers(gameId);

      // добавляем в список удаляемых игроков у пользователей
      this._removedPlayersList.push({
        gameId,
        model,
      });
    }

    // обновляем счетчики команд
    this._teamSizes[team].delete(gameId);

    delete this._users[gameId];
  }

  // обновляет команды
  updateKeys(gameId, keyStr) {
    const user = this._users[gameId];
    const [action, name] = keyStr.split(':');

    user.lastActionTime = Date.now();

    if (user.isWatching === true) {
      // если нажатие
      if (action === 'down') {
        // next player
        if (name === this._spectatorKeys.nextPlayer) {
          user.watchedGameId = this.getNextActivePlayerForUser(gameId);

          // prev player
        } else if (name === this._spectatorKeys.prevPlayer) {
          user.watchedGameId = this.getNextActivePlayerForUser(gameId, true);
        }
      }
    } else {
      this._game.updateKeys(gameId, { action, name });
    }
  }

  // добавляет сообщение
  pushMessage(gameId, message) {
    const user = this._users[gameId];

    if (user.isReady === false) {
      return;
    }

    user.lastActionTime = Date.now();

    message = sanitizeMessage(message);

    if (message) {
      if (message.charAt(0) === '/') {
        this.parseCommand(gameId, message);
      } else {
        this._chat.push(message, user.name, user.teamId);
      }
    }
  }

  // обрабатывает vote-данные пользователя
  parseVote(gameId, data) {
    const user = this._users[gameId];

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
        if (Object.keys(this._users).length === 1) {
          this._currentMap = value;
          this.createMap();

          // иначе запуск голосования
        } else {
          this.changeMap(gameId, value);
        }

        // иначе если смена статуса
      } else if (type === 'teamChange') {
        this.changeTeam(gameId, value);
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
  changeMap(gameId, mapName) {
    // если есть gameId и карта (голосование создает пользователь)
    if (typeof gameId !== 'undefined' && typeof mapName === 'string') {
      const voteName = 'mapChangeByUser';
      const userName = this._users[gameId].name;
      const userList = Object.keys(this._users).filter(id => id !== gameId);
      const payload = { name: voteName, params: [userName, mapName] };

      this._createVote({
        voteName,
        payload,
        resultFunc: result => {
          if (result === 'Yes' && this._maps[mapName]) {
            this._chat.pushSystem('VOTE_PASSED');
            this._chat.pushSystem('MAP_NEXT', [mapName]);
            this._timerManager.startMapChangeDelay(() => {
              this._currentMap = mapName;
              this.createMap();
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
        payload,
        resultFunc: resultingMapName => {
          if (resultingMapName && this._maps[resultingMapName]) {
            this._chat.pushSystem('VOTE_PASSED');
            this._chat.pushSystem('MAP_NEXT', [resultingMapName]);
            this._timerManager.startMapChangeDelay(() => {
              this._currentMap = resultingMapName;
              this.createMap();
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
  parseCommand(gameId, message) {
    message = message.replace(/\s\s+/g, ' ');

    const arr = message.split(' ');
    const cmd = arr.shift();

    switch (cmd) {
      // смена ника
      case '/name':
        this.changeName(gameId, arr.join(' '));
        break;

      // новый раунд
      case '/nr':
        if (this._isDevMode) {
          this.initiateNewRound();
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
        const user = this._users[gameId];

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

        // проверка количества активных игроков
        const activePlayerCount = Object.values(this._users).filter(
          user => user.teamId !== this._spectatorId,
        ).length;

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
      this._botManager.removeBots(team);

      if (count > 0) {
        count = this._botManager.createBots(count, team);
        this._chat.pushSystem('BOT_CREATED_FOR_TEAM', [userName, count, team]);
      } else {
        this._chat.pushSystem('BOT_REMOVED_FROM_TEAM', [userName, team]);
      }
    } else {
      this._botManager.removeBots();

      if (count > 0) {
        count = this._botManager.createBots(count, null);
        this._chat.pushSystem('BOT_CREATED', [userName, count]);
      } else {
        this._chat.pushSystem('BOT_REMOVED', [userName]);
      }
    }

    this.initiateNewRound();
  }

  // инициирует голосование за ботов
  _initiateBotVote(gameId, count, team) {
    const userName = this._users[gameId].name;
    let voteName;
    let voteArgs;

    if (team) {
      if (count > 0) {
        voteName = 'addBotsForTeam';
        voteArgs = [userName, count, team];
      } else {
        voteName = 'removeBotsForTeam';
        voteArgs = [userName, team];
      }
    } else {
      if (count > 0) {
        voteName = 'addBots';
        voteArgs = [userName, count];
      } else {
        voteName = 'removeBots';
        voteArgs = [userName];
      }
    }

    const payload = { name: voteName, params: voteArgs };
    const userList = Object.keys(this._users).filter(id => id !== gameId);

    this._createVote({
      voteName,
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

  _createVote(data) {
    const { voteName, payload, resultFunc, userList, gameId } = data;

    // если голосование заблокировано или уже было создано в vote
    if (
      this._timerManager.isVoteBlocked(voteName) ||
      this._vote.hasVote(voteName)
    ) {
      if (gameId) {
        this._chat.pushSystemByUser(gameId, 'VOTE_UNAVAILABLE');
      }

      return;
    }

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
        this._timerManager.startVoteBlockTimer(voteName, () => {});

        const result = this._vote.getResult(voteName);

        resultFunc(result);
      });
    };

    this._vote.createVote({
      name: voteName,
      payload,
      userList,
      onStartCallback: onStart,
    });
  }

  _resetVote() {
    this._timerManager.stopAllVoteTimers();
    this._timerManager.stopAllBlockedVoteTimers();
    this._vote.reset();
  }

  // обновляет значение round trip time
  updateRTT(gameId, pingId) {
    const latency = this._RTTManager.handlePong(gameId, pingId);

    if (latency !== null) {
      const user = this._users[gameId];

      if (user) {
        this._stat.updateUser(gameId, user.teamId, { latency });
      }
    }
  }
}

export default VIMP;
