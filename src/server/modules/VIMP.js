import Panel from './Panel.js';
import Stat from './Stat.js';
import Chat from './Chat.js';
import Vote from './Vote.js';
import Game from './Game.js';
import TimerManager from './TimerManager.js';

// Singleton VIMP

let vimp;

class VIMP {
  constructor(data, ports) {
    if (vimp) {
      return vimp;
    }

    vimp = this;

    this._maps = data.maps; // карты
    this._mapList = Object.keys(this._maps); // список карт массивом
    this._mapsInVote = data.mapsInVote; // карт в голосовании
    this._mapSetId = data.mapSetId; // дефолтный id конструктора карт
    this._currentMap = data.currentMap; // название текущей карты
    this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя

    this._expressions = {
      name: new RegExp(data.expressions.name),
      message: new RegExp(data.expressions.message, 'g'),
    };

    this._users = {}; // игроки

    // команды
    // team: teamId; { team1: 1, team2: 2, spectators: 3 }
    this._teams = data.teams;
    // название команды наблюдателя
    this._spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this._spectatorId = this._teams[this._spectatorTeam];
    // количество игроков в командах
    this._teamSizes = {}; // { team1: 0, team2: 0, spectators: 0 }

    // список gameId активных игроков на полотне
    this._activePlayersList = [];
    // список gameId игроков для удаления с полотна
    this._removedPlayersList = [];

    this._PORT_MAP_DATA = ports.MAP_DATA;
    this._PORT_FIRST_SHOT_DATA = ports.FIRST_SHOT_DATA;
    this._PORT_SHOT_DATA = ports.SHOT_DATA;
    this._PORT_INFORM_DATA = ports.INFORM_DATA;
    this._PORT_MISC = ports.MISC;
    this._PORT_CLEAR = ports.CLEAR;
    this._PORT_CONSOLE = ports.CONSOLE;

    this._currentMapData = null; // данные текущей карты

    this._blockedRemap = false; // флаг блокировки голосования за новую карту
    this._startMapNumber = 0; // номер первой карты в голосовании

    // инициализация сервисов
    const game = new Game(data.parts, data.keys, data.timeStep / 1000);
    const panel = new Panel(data.panel);
    const stat = new Stat(data.stat, this._teams);
    const chat = new Chat();
    const vote = new Vote();

    const timerManager = new TimerManager(
      {
        mapTime: data.mapTime, // продолжительность карты
        roundTime: data.roundTime, // продолжительность раунда
        voteTime: data.voteTime, // время голосования
        timeBlockedRemap: data.timeBlockedRemap, // время ожидания смены карты
        timeStep: data.timeStep, // время обновления кадра игры
      },
      {
        onMapTimeEnd: this.onMapTimeEnd.bind(this),
        onRoundTimeEnd: this.onRoundTimeEnd.bind(this),
        onShotTick: this.onShotTick.bind(this),
      },
    );

    // внедрение зависимостей
    game.injectServices({ vimp: this, panel });
    panel.injectTimerManager(timerManager);

    this._game = game;
    this._panel = panel;
    this._stat = stat;
    this._chat = chat;
    this._vote = vote;
    this._timerManager = timerManager;

    this.createMap();
  }

  onMapTimeEnd() {
    this._timerManager.stopChangeMapTimer();
    this._timerManager.stopBlockedRemapTimer();
    this._blockedRemap = false;
    this.changeMap();
  }

  onRoundTimeEnd() {
    this.startRound();
    this._timerManager.startRoundTimer();
    this._chat.pushSystem('t:1');
  }

  // создает кадр игры
  onShotTick(dt) {
    // обновление данных и физики
    this._game.updateData(dt);

    // список пользователей готовых к игре
    const userList = Object.keys(this._users).filter(
      gameId => this._users[gameId].isReady === true,
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

          coords = this._game.getPlayerCoords(user.watchedGameId);
        } else {
          coords = [0, 0];
        }
      } else {
        coords = this._game.getPlayerCoords(gameId);
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
    userList.forEach(gameId =>
      this._users[gameId].socket.send(
        this._PORT_SHOT_DATA,
        getUserData(gameId),
      ),
    );
  }

  // создаёт карту
  createMap() {
    this._currentMapData = this._maps[this._currentMap];

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setId) {
      this._currentMapData.setId = this._mapSetId;
    }

    // остановка таймеров игры
    this._timerManager.stopGameTimers();

    this.resetTeamSizes();

    this._activePlayersList = [];
    this._removedPlayersList = [];

    this._panel.reset();
    this._stat.reset();
    this._vote.reset();

    this._game.clear();
    this._game.createMap(this._currentMapData);

    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

        user.socket.send(this._PORT_CLEAR);

        // перемещение пользователя в наблюдатели
        this._stat.moveUser(gameId, user.teamId, this._spectatorId);

        // обнулить параметры
        user.team = this._spectatorTeam;
        user.teamId = this._spectatorId;
        user.nextTeam = null;
        user.isWatching = true;
        user.watchedGameId = null;

        this.sendMap(gameId);
      }
    }

    this._timerManager.startGameTimers();
  }

  // отправляет карту
  sendMap(gameId) {
    const user = this._users[gameId];

    user.socket.send(this._PORT_INFORM_DATA, [2]);
    user.isReady = false;
    user.currentMap = this._currentMap;
    user.socket.send(this._PORT_MAP_DATA, this._currentMapData);
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
      user.socket.send(this._PORT_FIRST_SHOT_DATA, [
        this._game.getFullPlayersData(), // game
        0, // coords
        this._panel.getEmptyPanel(), // panel
        this._stat.getFull(), // stat
        0, // chat
        [
          ['team', true],
          ['Выберите команду', Object.keys(this._teams), null],
        ], // vote: опрос выбора команды
        0, // keySet: 0 (наблюдатель)
      ]);
    }
  }

  // сообщает о готовности игрока к игре
  firstShotReady(gameId) {
    const user = this._users[gameId];

    // скрывает экран загрузки
    user.socket.send(this._PORT_INFORM_DATA);
    user.isReady = true;
  }

  // начало раунда: перемещаем игроков и отправляем первый кадр
  startRound() {
    const respawns = this._currentMapData.respawns;
    const respId = {};
    const fullStatData = this._stat.getFull();

    // очищение списка играющих
    this._activePlayersList = [];

    this._panel.reset();

    const setIdList = this._game.removePlayersAndShots();

    this._game.createMap(this._currentMapData);

    for (const gameId in this._users) {
      if (Object.hasOwn(this._users, gameId)) {
        const user = this._users[gameId];

        if (user.isReady === false) {
          continue;
        }

        user.socket.send(this._PORT_CLEAR, setIdList);

        const shotData = [
          {}, // game
          0, // coords
          0, // panel
          fullStatData, // stat
          0, // chat
          0, // vote
        ];

        const nextTeam = user.nextTeam;
        let teamId = user.teamId;

        // если пользователь сменил команду
        if (nextTeam !== null) {
          user.nextTeam = null;

          // перемещение пользователя в статистике
          this._stat.moveUser(gameId, teamId, this._teams[nextTeam]);

          teamId = user.teamId = this._teams[nextTeam];
          user.team = nextTeam;

          // если пользователь стал наблюдателем
          // нужно добавить его в списки удаляемых
          // и убрать из списков наблюдаемых
          if (teamId === this._spectatorId) {
            this._removedPlayersList.push({
              gameId,
              model: user.model,
            });

            this.removeFromActivePlayers(gameId);
          }
        }

        if (teamId !== this._spectatorId) {
          user.isWatching = false;
          // полный набор данных для инициализации активного игрока
          shotData[2] = this._panel.getFullPanel(gameId);
          shotData[6] = 1; // keySet игрока
          this.addToActivePlayers(gameId);
          this._stat.updateUser(gameId, teamId, { status: '' });
        } else {
          user.isWatching = true;
          // пустая панель для наблюдателя
          shotData[2] = this._panel.getEmptyPanel();
          shotData[6] = 0; // keySet наблюдателя
        }

        // отправка первого кадра
        user.socket.send(this._PORT_SHOT_DATA, shotData);

        respId[user.team] = respId[user.team] || 0;
        const data = respawns[user.team];

        // если есть данные для создания модели
        if (data) {
          this._game.createPlayer(
            gameId,
            user.model,
            user.name,
            user.teamId,
            data[respId[user.team]],
          );
          respId[user.team] += 1;
        }
      }
    }
  }

  // принудительно стартует раунд заново
  restartRound() {
    this._timerManager.stopRoundTimer();
    this.startRound();
    this._timerManager.startRoundTimer();
    this._chat.pushSystem('t:1');
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

    if (this._expressions.name.test(name)) {
      name = this.checkName(name);
      user.name = name;
      this._game.changeName(gameId, name);
      this._stat.updateUser(gameId, user.teamId, { name });
      this._chat.pushSystem(`n:1:${oldName},${name}`);
      user.socket.send(this._PORT_MISC, {
        key: 'localstorageNameReplace',
        value: name,
      });
    } else {
      this._chat.pushSystem('n:0', gameId);
    }
  }

  // меняет команду игрока
  changeTeam(gameId, team) {
    const user = this._users[gameId];
    let currentTeam = user.team;
    const nextTeam = user.nextTeam;
    const respawns = this._currentMapData.respawns;

    // если команда уже была выбрана
    if (team === nextTeam) {
      if (team !== this._spectatorTeam) {
        this._chat.pushSystem(`s:4:${team}`, gameId);
      } else {
        this._chat.pushSystem('s:5', gameId);
      }

      // иначе если команда является текущей и не изменится в следующем раунде
    } else if (team === currentTeam && nextTeam === null) {
      if (team !== this._spectatorTeam) {
        this._chat.pushSystem(`s:2:${team}`, gameId);
      } else {
        this._chat.pushSystem('s:3', gameId);
      }

      // иначе смена команды
    } else {
      currentTeam = nextTeam !== null ? nextTeam : currentTeam;

      if (team !== this._spectatorTeam) {
        // если количество респаунов на карте в выбраной команде
        // равно количеству игроков в этой команде (смена невозможна)
        if (respawns[team].length === this._teamSizes[team]) {
          if (currentTeam !== this._spectatorTeam) {
            this._chat.pushSystem(`s:0:${team},${currentTeam}`, gameId);
          } else {
            this._chat.pushSystem(`s:1:${team}`, gameId);
          }

          return;
        }

        this._chat.pushSystem(`s:4:${team}`, gameId);
      } else {
        this._chat.pushSystem('s:5', gameId);
      }

      this._teamSizes[currentTeam] -= 1;

      user.nextTeam = team;

      this._teamSizes[team] += 1;

      // если на сервере менее 2-х активных игроков
      // требуется начать раунд заново
      if (this._activePlayersList.filter(id => id !== gameId).length < 2) {
        this.restartRound();
      }
    }
  }

  // сбрасывает this._teamSizes в нулевые значения
  resetTeamSizes() {
    this._teamSizes = Object.keys(this._teams).reduce((acc, key) => {
      acc[key] = 0;
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

  // обрабатывает уничтожение игрока, делает его наблюдателем
  reportPlayerDestroyed(gameId) {
    const user = this._users[gameId];

    if (!user || user.isWatching) {
      return;
    }

    user.isWatching = true;

    this._stat.updateUser(gameId, user.teamId, { deaths: 1, status: 'dead' });
    // отмена всех запланированных обновлений для панели
    this._panel.invalidate(gameId);

    const shotData = [
      {},
      0,
      this._panel.getEmptyPanel(),
      0,
      0,
      0,
      0, // keySet = 0 для наблюдателя
    ];

    user.socket.send(this._PORT_SHOT_DATA, shotData);
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
  createUser(params, socket, cb) {
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
      // сокет
      socket,
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
      // название команды в следующем раунде
      nextTeam: null,
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
    };

    this._chat.addUser(gameId);
    this._vote.addUser(gameId);
    this._stat.addUser(gameId, this._spectatorId, { name });
    this._panel.addUser(gameId);

    process.nextTick(() => {
      cb(gameId);
      this.sendMap(gameId);
    });
  }

  // удаляет игрока полностью из игры
  removeUser(gameId) {
    const user = this._users[gameId];
    const { team, teamId, model, nextTeam } = user;

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
    this._teamSizes[nextTeam !== null ? nextTeam : team] -= 1;

    delete this._users[gameId];
  }

  // обновляет команды
  updateKeys(gameId, keys) {
    const user = this._users[gameId];

    if (user.isWatching === true) {
      // next player
      if (keys & this._spectatorKeys.nextPlayer) {
        user.watchedGameId = this.getNextActivePlayerForUser(gameId);

        // prev player
      } else if (keys & this._spectatorKeys.prevPlayer) {
        user.watchedGameId = this.getNextActivePlayerForUser(gameId, true);
      }
    } else {
      this._game.updateKeys(gameId, keys);
    }
  }

  // добавляет сообщение
  pushMessage(gameId, message) {
    const user = this._users[gameId];

    if (user.isReady === false) {
      return;
    }

    message = message.replace(this._expressions.message, '');

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

    // если данные 'строка' (запрос данных)
    if (typeof data === 'string') {
      // если запрос списка команд
      if (data === 'teams') {
        this._vote.pushByUser(gameId, [null, Object.keys(this._teams)]);

        // если запрос всех карт
      } else if (data === 'maps') {
        this._vote.pushByUser(gameId, [null, this._mapList]);

        // если запрос пользователей
      } else if (data === 'users') {
        const dataArr = [];

        for (const p in this._users) {
          if (Object.hasOwn(this._users, p)) {
            dataArr.push(this._users[p].name + ':' + p);
          }
        }
        this._vote.pushByUser(gameId, [null, dataArr]);
      }

      // если данные 'объект' (результат голосования)
    } else if (typeof data === 'object') {
      const type = data[0];
      let value = data[1];

      // если пользователь проголосовал за карту
      if (type === 'changeMap') {
        value = value[0];
        this._vote.addInVote(type, value);
        this._chat.pushSystem('v:0', gameId);

        // иначе если пользователь захотел сменить карту
      } else if (type === 'mapUser') {
        value = value[0];

        // если карта является текущей
        if (value === this._currentMap) {
          this._chat.pushSystem('v:1:' + value, gameId);
        } else {
          // если пользователь один в игре (смена карты)
          if (Object.keys(this._users).length === 1) {
            this._currentMap = value;
            this.createMap();

            // иначе запуск голосования
          } else {
            this.changeMap(gameId, value);
          }
        }

        // иначе если смена статуса
      } else if (type === 'team') {
        this.changeTeam(gameId, value[0]);
      }
    }
  }

  // отправляет голосование за новую карту
  changeMap(gameId, mapName) {
    // возвращает список карт для голосования
    const getMapList = () => {
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
    };

    // если смена карты возможна
    if (this._blockedRemap === false) {
      this._blockedRemap = true;

      // если есть gameId и карта (голосование создает пользователь)
      if (typeof gameId !== 'undefined' && typeof mapName === 'string') {
        const arr = [
          this._users[gameId].name + ' предложил карту: ' + mapName,
          ['Сменить:' + mapName, 'Не менять:'],
          null,
        ];

        const userList = [];

        for (const p in this._users) {
          if (Object.hasOwn(this._users, p)) {
            const id = this._users[p].gameId;

            if (id !== gameId) {
              userList.push(id);
            }
          }
        }

        this._vote.createVote([['changeMap'], arr], userList);
        this._vote.addInVote('changeMap', mapName);
        this._chat.pushSystem('v:2', gameId);

        // иначе голосование создает игра
      } else {
        const arr = ['Выберете следующую карту', getMapList(), null];
        this._vote.createVote([['changeMap'], arr]);
      }

      // собирает результаты голосования и стартует новую карту
      this._timerManager.startChangeMapTimer(() => {
        const mapName = this._vote.getResult('changeMap');

        // если карта не выбрана
        if (!mapName) {
          // если голосование создаёт игра, требуется обновить время карты
          if (typeof gameId === 'undefined') {
            this._timerManager.stopMapTimer();
            this._timerManager.startMapTimer();
          }

          this._chat.pushSystem('v:5');
          this._chat.pushSystem('t:0:' + this._currentMap);

          // если есть результат и карта существует
        } else if (this._maps[mapName]) {
          this._chat.pushSystem('v:4:' + mapName);

          setTimeout(() => {
            this._currentMap = mapName;
            this.createMap();
          }, 2000);
        }

        // снимает блокировку смены карты
        this._timerManager.startBlockedRemapTimer(() => {
          this._blockedRemap = false;
        });
      });
    } else {
      if (typeof gameId !== 'undefined') {
        this._chat.pushSystem('v:3', gameId);
      }
    }
  }

  // обрабатывает команду от пользователя
  parseCommand(gameId, message) {
    message = message.replace(/\s\s+/g, ' ');

    const arr = message.split(' ');
    const cmd = arr.shift();
    const value = arr.join(' ');

    switch (cmd) {
      // смена ника
      case '/name':
        this.changeName(gameId, value);
        break;

      // новый раунд
      case '/nr':
        this.restartRound();
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

        this._chat.pushSystem(
          [getTime(this._timerManager.getMapTimeLeft())],
          gameId,
        );
        break;
      }

      // название текущей карты
      case '/mapname':
        this._chat.pushSystem([this._currentMap], gameId);
        break;

      default:
        this._chat.pushSystem(['Command not found'], gameId);
    }
  }
}

export default VIMP;
