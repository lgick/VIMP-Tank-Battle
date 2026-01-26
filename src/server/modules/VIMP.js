import Game from './Game.js';
import Panel from './Panel.js';
import Stat from './Stat.js';
import Chat from './chat/index.js';
import Vote from './Vote.js';
import UserManager from '../managers/UserManager.js';
import RTTManager from '../managers/RTTManager.js';
import TimerManager from '../managers/TimerManager.js';
import SnapshotManager from '../managers/SnapshotManager.js';
import BotManager from '../managers/bots/index.js';
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

    this._isRoundEnding = false; // флаг, если раунд процессе завершения
    this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя
    this._maxPlayers = data.maxPlayers; // максимальное количество игроков
    this._spectatorTeam = data.spectatorTeam; // название команды наблюдателей

    this._userManager = new UserManager(
      data.idleKickTimeout,
      data.teams,
      data.spectatorTeam,
    );

    this._maps = data.maps; // карты
    this._mapScale = data.mapScale;
    this._mapList = Object.keys(this._maps); // список карт массивом
    this._mapsInVote = data.mapsInVote; // карт в голосовании
    this._mapSetId = data.mapSetId; // дефолтный id конструктора карт
    this._currentMap = data.currentMap; // название текущей карты
    this._currentMapData = null; // данные текущей карты
    this._scaledMapData = null; // масштабированные данные текущей карты
    this._startMapNumber = 0; // номер первой карты в голосовании

    this._game = new Game(
      data.parts,
      data.playerKeys,
      data.timers.timeStep / 1000,
    );
    this._panel = new Panel(data.panel);
    this._stat = new Stat(data.stat, this.teams);
    this._chat = new Chat();
    this._vote = new Vote();

    this._socketManager = socketManager;

    this._snapshotManager = new SnapshotManager(
      this._game,
      data.timers.networkSendRate,
    );

    this._botManager = new BotManager(
      data.parts,
      this._userManager,
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
    console.warn(`[RTT] Kick user - pong latency exceeded`);
    this._socketManager.close(gameId, 4003, 'kickForMaxLatency');
    this.removeUser(gameId);
  }

  // кикает за превышение прокусков ответа на ping
  _kickForMissedPings(gameId) {
    console.warn(`[RTT] Kick user - no response to pings`);
    this._socketManager.close(gameId, 4004, 'kickForMissedPings');
    this.removeUser(gameId);
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

    if (this._botManager.getBotCount() > 0) {
      this._botManager.updateBots(dt);
      this._botManager.buildSpatialGrid(this._game.getAlivePlayers());
    }

    // получение снимка (snapshot)
    const gameSnapshot = this._snapshotManager.processTick();
    const userManager = this._userManager;

    // если gameSnapshot, значит время отправлять данные snapshot
    if (gameSnapshot) {
      const dynamicMapData = this._game.getDynamicMapData();

      if (dynamicMapData) {
        gameSnapshot[this._currentMapData.setId] = dynamicMapData;
      }

      // игроки для удаления с полотна
      userManager.writeRemovedPlayersToSnapshot(gameSnapshot);

      userManager.forEachSnapshotTarget((userId, watchingId, shake, reset) => {
        this._socketManager.sendSnapshot(userId, [
          gameSnapshot,
          [this._game.getPosition(watchingId) || [0, 0], shake, reset],
        ]);
      });
    } else {
      const stat = this._stat.getLast() || 0;
      const chat = this._chat.shift() || 0;
      const vote = this._vote.shift() || 0;

      if (stat || chat || vote) {
        userManager.forEachReadyUserId(gameId => {
          this._socketManager.sendEvents(gameId, [0, stat, chat, vote]);
        });
      } else {
        const panelUpdates = this._panel.processUpdates();

        userManager.forEachReadyUserId(gameId => {
          const panel = panelUpdates.get(gameId) || 0;
          const chat = this._chat.shiftByUser(gameId) || 0;
          const vote = this._vote.shiftByUser(gameId) || 0;

          if (panel || chat || vote) {
            this._socketManager.sendEvents(gameId, [panel, 0, chat, vote]);
          }
        });
      }
    }
  }

  // проверяет игроков на бездействие и кикает, если превышен порог
  _kickIdleUsers() {
    const usersToKick = this._userManager.getReadyUsersToKick();

    // кик неактивных пользователей
    for (let i = 0, len = usersToKick.length; i < len; i += 1) {
      const gameId = usersToKick[i];

      this._socketManager.close(gameId, 4005, 'kickIdle');
      this.removeUser(gameId);
    }
  }

  // отправляет ping всем пользователям
  _sendPing() {
    const users = this._RTTManager.scheduleNextPing();

    for (const [gameId, { pingIdCounter }] of users) {
      this._socketManager.sendPing(gameId, pingIdCounter);
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
    this._botManager.createMap(this._scaledMapData);
    const botCounts = this._botManager.getBotCountsPerTeam();
    this._botManager.removeBots();
    this._botManager.clearSpatialGrid();

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setId) {
      this._currentMapData.setId = this._mapSetId;
    }

    // остановка всех игровых таймеров и отложенных вызовов
    this._timerManager.stopGameTimers();

    this._panel.reset();
    this._stat.reset();
    this._resetVote();

    this._snapshotManager.reset();

    this._game.clear();
    this._game.createMap(this._scaledMapData);

    const userList = this._userManager.initializeAllUsersAsSpectators();

    for (let i = 0, len = userList.length; i < len; i += 1) {
      const { gameId, oldTeamId, newTeamId } = userList[i];

      this._socketManager.sendClear(gameId);
      this._stat.moveUser(gameId, oldTeamId, newTeamId);
      this.sendMap(gameId);
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
    if (!this._userManager.isUser(gameId)) {
      return;
    }

    this._userManager.setUserMap(gameId, this._currentMap);
    this._socketManager.sendTechInform(gameId, 'loading');
    this._socketManager.sendMap(gameId, this._currentMapData);
  }

  // сообщает о загрузке карты
  mapReady(gameId) {
    const user = this._userManager.getUser(gameId);

    if (!user) {
      return;
    }

    // если карта не актуальна
    if (user.currentMap !== this._currentMap) {
      this.sendMap(gameId);

      return;
    }

    // если игрок ещё не готов, отправка первого events
    if (!this._userManager.isUserReady(gameId)) {
      this._socketManager.sendFirstEvents(gameId);
    }
  }

  // сообщает о готовности игрока к игре
  firstEventsReady(gameId) {
    const user = this._userManager.getUser(gameId);

    if (!user) {
      return;
    }

    this._userManager.setUserReady(gameId);
    this._socketManager.sendTechInform(gameId); // скрывает экран загрузки
    this._socketManager.sendFirstVote(gameId);
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

    // локальный map для подсчета выданных спавнов
    const respawnCounters = new Map();

    // заполнение нулями для всех команд, представленных на карте
    for (const teamName of Object.keys(respawns)) {
      respawnCounters.set(teamName, 0);
    }

    function getRespawnData(team) {
      let index = respawnCounters.get(team); // текущий индекс для команды

      // если команда не найдена в респаунах
      if (typeof index === 'undefined') {
        return [0, 0, 0];
      }

      const data = respawns[team][index]; // координаты [x, y, angle]

      index += 1;

      // если игроков больше чем точек спавна, начинается с начала
      // это предотвращает undefined, если на карте 5 точек, а игроков 6
      if (index >= respawns[team].length) {
        index = 0;
      }

      respawnCounters.set(team, index);

      return data;
    }

    // очищение списка играющих
    this._userManager.clearAlivePlayers();

    this._panel.reset();

    const setIdList = this._game.removePlayersAndShots();

    this._game.createMap(this._scaledMapData);

    this._userManager.forEachReadyUser(user => {
      const { gameId, team } = user;

      this._socketManager.sendClear(gameId, setIdList);

      if (team === this._spectatorTeam) {
        this._userManager.setSpectator(gameId);
        this._socketManager.sendSpectatorDefaultEvents(gameId);
      } else {
        this._setActivePlayer(gameId, getRespawnData(team));
      }

      this._socketManager.sendRoundStart(gameId);
    });

    // создание ботов на карте
    for (const botData of this._botManager.getBots()) {
      this._setActivePlayer(botData.gameId, getRespawnData(botData.team), true);
    }
  }

  // меняет ник игрока
  _changeName(gameId, name) {
    const userData = this._userManager.changeUserName(gameId, name);

    if (userData) {
      const { teamId, oldName, newName } = userData;

      // TODO удалить name в game
      this._game.changeName(gameId, name);
      this._stat.updateUser(gameId, teamId, { name: newName });
      this._chat.pushSystem('NAME_CHANGED', [oldName, newName]);
      this._socketManager.sendName(gameId, newName);
    } else {
      this._chat.pushSystemByUser(gameId, 'NAME_INVALID');
    }
  }

  // меняет команду игрока
  _changeTeam(gameId, newTeam) {
    const currentTeam = this._userManager.getUserTeam(gameId);

    // если игрок выбирает свою текущую команду
    if (newTeam === currentTeam) {
      this._chat.pushSystemByUser(gameId, 'TEAMS_YOUR_TEAM', [newTeam]);
      return;
    }

    const respawns = this._scaledMapData.respawns;
    const teamSize = this._userManager.getTeamSize(newTeam);

    // если новая команда не наблюдатель и нет свободных респаунов,
    // попытка удалить одного бота, чтобы освободить место
    if (
      newTeam !== this._spectatorTeam &&
      respawns[newTeam].length <= teamSize
    ) {
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
    this._userManager.changeTeamSets(gameId, newTeam, currentTeam);

    const { teamId: oldTeamId, team: oldTeam } =
      this._userManager.getUserTeamData(gameId);
    const newTeamId = this._userManager.changeUserTeam(gameId, newTeam);

    this._stat.moveUser(gameId, oldTeamId, newTeamId);

    // если количество активных игроков за исключением пользователя
    // меньше 2, рестарт раунда
    if (this._userManager.getPlayerCountWithout(gameId) < 2) {
      this._stat.reset();
      this._initiateNewRound();
      this._chat.pushSystemByUser(gameId, 'TEAMS_NEW_TEAM', [newTeam]);

      return;
    }

    // если переход из активного игрока в наблюдатели
    if (newTeam === this._spectatorTeam) {
      this._setSpectatorFromActivePlayer(gameId);
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
      if (oldTeam !== this._spectatorTeam) {
        this._setSpectatorFromActivePlayer(gameId);
      }
      // игра активным игроком возможна в текущем раунде
    } else {
      const respawnIndex = this._userManager.getTeamSize(newTeam) - 1;
      const respawnData = respawns[newTeam][respawnIndex];

      // переход из наблюдателя в игрока
      if (oldTeam === this._spectatorTeam) {
        this._setActivePlayer(gameId, respawnData);
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
  _setSpectatorFromActivePlayer(gameId) {
    this._userManager.setSpectatorFromActivePlayer(gameId);
    this._userManager.addToRemovedPlayers(gameId);
    this._game.removePlayer(gameId);
    this._socketManager.sendSpectatorDefaultEvents(gameId);
  }

  // перевод игрока в активные игроки
  _setActivePlayer(gameId, respawnData, isBot) {
    const { teamId, model, name } = this._userManager.setActivePlayer(gameId);

    if (!isBot) {
      this._socketManager.sendPlayerDefaultEvents(gameId);
    }

    this._stat.updateUser(gameId, teamId, { status: '' });
    // TODO name teamId не нужны в game
    this._game.createPlayer(gameId, model, name, teamId, respawnData);
  }

  // проверяет уничтожение всей команды
  _checkTeamWipe(victimTeam, killerTeam) {
    // если раунд уже в процессе завершения
    if (this._isRoundEnding) {
      return;
    }

    let winnerTeam = null;

    // если команда наблюдателей, или если есть живые игроки
    if (
      victimTeam === this._spectatorTeam ||
      this._userManager.getAlivePlayerCountByTeam(victimTeam) > 0
    ) {
      return;
    }

    // TODO боты будут в userManager, isAlive не нужен
    // проверка на живых ботов в команде
    for (const botData of this._botManager.getBots()) {
      // если нашелся живой бот, команда не уничтожена
      if (botData.team === victimTeam && this._game.isAlive(botData.gameId)) {
        return;
      }
    }

    // активация флага завершения раунда
    this._isRoundEnding = true;

    const victimTeamId = this._userManager.getTeamId(victimTeam);
    const killerTeamId = this._userManager.getTeamId(killerTeam);

    // запись поражения команде
    this._stat.updateHead(victimTeamId, 'deaths', 1);

    // если убийца из другой команды, фраг для команды-победителя
    if (killerTeamId && killerTeamId !== victimTeamId) {
      this._stat.updateHead(killerTeamId, 'score', 1);

      winnerTeam = this._userManager.getTeamName(killerTeamId);
    }

    // если есть команда-победитель
    if (winnerTeam) {
      this._userManager.forEachReadyUser(user => {
        const gameId = user.gameId;

        if (user.team === victimTeam) {
          this._socketManager.sendDefeat(gameId);
        } else {
          this._socketManager.sendVictory(gameId);
        }

        this._socketManager.sendRoundEnd(gameId, winnerTeam);
      });
    } else {
      this._userManager.forEachReadyUserId(gameId => {
        this._socketManager.sendDefeat(gameId);
        this._socketManager.sendRoundEnd(gameId);
      });
    }

    this._timerManager.stopRoundTimer();
    this._timerManager.startRoundRestartDelay(); // отложенный перезапуск раунда
  }

  // обрабатывает уничтожение игрока, обновляет статистику
  reportKill(victimId, killerId) {
    const victimUser =
      this._userManager.getUser(victimId) ||
      this._botManager.getBotById(victimId);

    if (!victimUser) {
      return;
    }

    this._stat.updateUser(victimId, victimUser.teamId, {
      deaths: 1,
      status: 'dead',
    });

    // отмена всех запланированных обновлений панели
    this._panel.invalidate(victimId);

    if (!victimUser.isBot) {
      this._socketManager.sendSpectatorDefaultEvents(victimId);
      this._socketManager.sendGameOverSound(victimId);
    }

    const killerUser =
      this._userManager.getUser(killerId) ||
      this._botManager.getBotById(killerId);

    // если это не самоубийство
    if (victimId !== killerId) {
      // если это не убийство игрока своей команды
      if (victimUser.teamId !== killerUser.teamId) {
        this._stat.updateUser(killerId, killerUser.teamId, { score: 1 });
        // иначе если это огонь по своим
      } else {
        this._stat.updateUser(killerId, killerUser.teamId, { score: -1 });
      }

      if (!killerUser.isBot) {
        this._socketManager.sendFragSound(killerUser.gameId);
      }
    }

    // перевод в наблюдатели
    this._userManager.setSpectatorFromActivePlayer(victimId, killerId);

    this._chat.pushSystem('REPORT_KILL', [killerUser.name, victimUser.name]);

    // проверка на уничтожение всей команды противника
    this._checkTeamWipe(victimUser.team, killerUser.team);
  }

  // активирует тряску камеры у игрока
  triggerCameraShake(gameId, shakeParams) {
    this._userManager.activateCameraShake(gameId, shakeParams);
  }

  // создает нового игрока
  createUser(gameId, params) {
    const { name, teamId } = this._userManager.addUser(gameId, params);

    this._chat.addUser(gameId);
    this._vote.addUser(gameId);
    this._stat.addUser(gameId, teamId, { name });
    this._panel.addUser(gameId);
    this._RTTManager.addUser(gameId);
  }

  // удаляет игрока полностью из игры
  removeUser(gameId) {
    const user = this._userManager.getUser(gameId);

    if (!user) {
      return;
    }

    const { teamId, team, name } = user;

    this._RTTManager.removeUser(gameId);
    this._stat.removeUser(gameId, teamId);
    this._chat.removeUser(gameId);
    this._vote.removeUser(gameId);
    this._panel.removeUser(gameId);

    // если не наблюдатель
    if (team !== this._spectatorTeam) {
      // удаление из модуля game
      this._game.removePlayer(gameId);
    }

    this._userManager.removeUser(gameId);
    this._chat.pushSystem('USER_LEFT', [name]);
  }

  // обновляет команды
  updateKeys(gameId, keyStr) {
    const user = this._userManager.getUser(gameId);

    if (!user) {
      return;
    }

    this._userManager.touchUserActivity(gameId);

    const [action, name] = keyStr.split(':');

    if (user.isWatching === true) {
      // если нажатие
      if (action === 'down') {
        // next player
        if (name === this._spectatorKeys.nextPlayer) {
          this._userManager.getNextAlivePlayerForUser(gameId);

          // prev player
        } else if (name === this._spectatorKeys.prevPlayer) {
          this._userManager.getNextAlivePlayerForUser(gameId, true);
        }
      }
    } else {
      this._game.updateKeys(gameId, { action, name });
    }
  }

  // добавляет сообщение
  pushMessage(gameId, message) {
    const user = this._userManager.getReadyUser(gameId);

    if (!user) {
      return;
    }

    this._userManager.touchUserActivity(gameId);

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
    const user = this._userManager.getReadyUser(gameId);

    if (!user) {
      return;
    }

    this._userManager.touchUserActivity(gameId);

    // если данные 'строка' (запрос данных)
    if (typeof data === 'string') {
      // если запрос списка команд
      if (data === 'teams') {
        this._vote.pushByUser(gameId, this._userManager.getTeamList());

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
        if (this._userManager.getUserCount(user => !user.isBot) === 1) {
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
    if (gameId && typeof mapName === 'string') {
      const voteName = 'mapChangeByUser';

      const userName = this._userManager.getUserName(gameId);
      const payload = { name: voteName, params: [userName, mapName] };
      const userList = this._userManager.getReadyUsersWithout(gameId);

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
        const user = this._userManager.getReadyUser(gameId);

        if (user.team === this._spectatorTeam) {
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
        if (team && !this._userManager.isPlayingTeam(team)) {
          this._chat.pushSystemByUser(gameId, 'BOT_INVALID_TEAM');
          break;
        }

        // если команда на удаление ботов, но удалять нечего
        if (count === 0) {
          if (team && this._botManager.getBotCountForTeam(team) === 0) {
            this._chat.pushSystemByUser(gameId, 'BOT_REMOVED_FROM_TEAM', [
              team,
            ]);
            break;
          }

          if (this._botManager.getBotCount() === 0) {
            this._chat.pushSystemByUser(gameId, 'BOT_REMOVED');
            break;
          }
        }

        // если активный игрок один, выполнение команды
        if (this._userManager.getHumanPlayerCount() <= 1) {
          this._executeBotCommand(count, team);
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
  _executeBotCommand(count, team) {
    if (team) {
      this._botManager.removeBots(team);

      if (count > 0) {
        count = this._botManager.createBots(count, team);
        this._chat.pushSystem('BOT_CREATED_FOR_TEAM', [count, team]);
      } else {
        this._chat.pushSystem('BOT_REMOVED_FROM_TEAM', [team]);
      }
    } else {
      this._botManager.removeBots();

      if (count > 0) {
        count = this._botManager.createBots(count, null);
        this._chat.pushSystem('BOT_CREATED', [count]);
      } else {
        this._chat.pushSystem('BOT_REMOVED');
      }
    }

    this._initiateNewRound();
  }

  // инициирует голосование за ботов
  _initiateBotVote(gameId, count, team) {
    const userName = this._userManager.getUserName(gameId);
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
    const userList = this._userManager.getReadyUsersWithout(gameId);

    this._createVote({
      voteName,
      voteCategory,
      payload,
      resultFunc: result => {
        if (result === 'Yes') {
          this._chat.pushSystem('VOTE_PASSED');
          this._executeBotCommand(count, team);
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
      const user = this._userManager.getUser(gameId);

      if (user) {
        this._stat.updateUser(gameId, user.teamId, { latency });
      }
    }
  }
}

export default VIMP;
