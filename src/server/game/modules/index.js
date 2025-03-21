import Panel from './panel.js';
import Stat from './stat.js';
import Chat from './chat.js';
import Vote from './vote.js';
import Game from './game.js';

// Singleton
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
    this._mapSetID = data.mapSetID; // дефолтный id конструктора карт
    this._defaultBullet = data.defaultBullet; // дефолтные значения пуль моделей
    this._currentMap = data.currentMap; // название текущей карты
    this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя

    this._expressions = {
      name: new RegExp(data.expressions.name),
      message: new RegExp(data.expressions.message, 'g'),
      email: new RegExp(data.expressions.email, 'i'),
    };

    this._mapTime = data.mapTime; // продолжительность карты
    this._shotTime = data.shotTime; // время обновления кадра игры
    this._roundTime = data.roundTime; // продолжительность раунда
    this._voteTime = data.voteTime; // время голосования
    this._timeBlockedRemap = data.timeBlockedRemap;

    // команды
    this._teams = data.teams;
    // список команд массивом
    this._teamList = Object.keys(this._teams);
    // название команды наблюдателя
    this._spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this._spectatorID = this._teams[this._spectatorTeam];

    this._portConfig = ports.config;
    this._portAuth = ports.auth;
    this._portAuthErr = ports.authErr;
    this._portMap = ports.map;
    this._portShot = ports.shot;
    this._portInform = ports.inform;
    this._portMisc = ports.misc;
    this._portLog = ports.log;

    this._users = {}; // игроки
    this._currentMapData = null; // данные текущей карты

    this._roundTimer = null;
    this._shotTimer = null;
    this._mapTimer = null;

    this._startMapTime = 0; // время запуска карты
    this._startRoundTime = 0; // время запуска раунда

    this._teamSizes = {}; // количество игроков в командах
    this._activePlayersList = []; // список gameID активных игроков на полотне
    this._removedPlayersList = []; // список gameID игроков для удаления с полотна

    this._blockedRemap = false; // флаг блокировки голосования за новую карту
    this._startMapNumber = 0; // номер первой карты в голосовании

    this._panel = new Panel(data.panel);
    this._stat = new Stat(data.stat, this._teams);
    this._chat = new Chat();
    this._vote = new Vote();
    this._game = new Game(
      data.factory,
      data.parts,
      data.keys,
      data.shotTime,
    );

    this._email = data.email;

    this.createMap();
  }

  // запускает таймеры игры
  startGameTimers() {
    this.startMapTimer();
    this.startShotTimer();
    this.startRoundTimer();
  }

  // останавливает таймеры игры
  stopGameTimers() {
    // останавливает расчет кадров игры
    clearInterval(this._shotTimer);
    // останавливает раунд
    clearTimeout(this._roundTimer);
    // останавливает карту
    clearTimeout(this._mapTimer);
  }

  // стартует карту
  startMapTimer() {
    this._chat.pushSystem('t:0:' + this._currentMap);
    this._startMapTime = Date.now();

    this._mapTimer = setTimeout(() => {
      this.changeMap();
    }, this._mapTime);
  }

  // стартует раунд
  startRoundTimer() {
    this._startRoundTime = Date.now();

    this.startRound();
    this._panel.reset();

    this._roundTimer = setTimeout(() => {
      this.startRoundTimer();
      this._chat.pushSystem('t:1');
    }, this._roundTime);
  }

  // стартует расчет кадров игры
  startShotTimer() {
    this._shotTimer = setInterval(() => {
      this.createShot();
    }, this._shotTime);
  }

  // возвращает оставшееся время раунда (seconds)
  getRoundTimeLeft() {
    let timeLeft =
      this._roundTime - (Date.now() - this._startRoundTime);

    timeLeft = Math.floor(timeLeft / 1000 - 3);

    return timeLeft < 0 ? 0 : timeLeft;
  }

  // возвращает оставшееся время карты (ms)
  getMapTimeLeft() {
    const timeLeft =
      this._mapTime - (Date.now() - this._startMapTime);

    return timeLeft < 0 ? 0 : timeLeft;
  }

  // создаёт карту
  createMap() {
    this._currentMapData = this._maps[this._currentMap];

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setID) {
      this._currentMapData.setID = this._mapSetID;
    }

    this.stopGameTimers();

    this._teamSizes = {};
    this._stat.reset();

    this._game.createMap(this._currentMapData);

    // корректирование статуса игроков под новые респауны
    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        let user = this._users[p];

        // обнулить параметр на смену команды
        user.nextTeam = null;

        let teamData = this.checkTeam(user.team);

        // если текущая команда не свободна
        if (user.team !== teamData.team) {
          user.nextTeam = teamData.team;
        }

        this._chat.pushSystem(teamData.message, user.gameID);
      }
    }

    this.sendMap();
    this.startGameTimers();
  }

  // отправляет карту либо конкретному игроку, либо всем
  sendMap(gameID) {
    if (gameID) {
      let user = this._users[gameID];

      user.socket.send(this._portInform, [3]);
      user.mapReady = false;
      user.socket.send(this._portMap, this._currentMapData);
    } else {
      for (const p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          let user = this._users[p];

          user.socket.send(this._portInform, [3]);
          user.mapReady = false;
          user.socket.send(this._portMap, this._currentMapData);
        }
      }
    }
  }

  // сообщает о загрузке карты
  mapReady(err, gameID) {
    const user = this._users[gameID];

    if (!err) {
      // если на сервере 1-2 игрока
      // и хотя бы один из них ожидает
      // и не является наблюдателем
      // требуется начать раунд заново
      if (
        Object.keys(this._users).length <= 2 &&
        Object.values(this._users).some(
          user =>
            user.isWatching === true &&
            user.teamID !== this._spectatorID,
        )
      ) {
        this.restartRound();
      }

      // скрывает экран загрузки
      user.socket.send(this._portInform);
      user.mapReady = true;

      // полная загрузка game-данных
      user.socket.send(this._portShot, [
        this._game.getFullUsersData(), // game
        [0, 0], // coords
        [this.getRoundTimeLeft()], // panel
        this._stat.getFull(), // stat
        0, // chat
        0, // vote
      ]);
    }
  }

  // отправляет первый shot (в начале каждого раунда)
  sendFirstShot(gameID, gameData) {
    const user = this._users[gameID];
    const nextTeam = user.nextTeam;
    let teamID = user.teamID;
    const data = [];

    data[0] = gameData || {}; // game
    data[1] = 0; // coords
    data[2] = 0; // panel
    data[3] = 0; // stat
    data[4] = 0; // chat
    data[5] = 0; // vote

    // если пользователь сменил команду
    if (nextTeam !== null) {
      user.nextTeam = null;

      // перемещение пользователя в статистике
      this._stat.moveUser(gameID, teamID, this._teams[nextTeam]);

      teamID = user.teamID = this._teams[nextTeam];
      user.team = nextTeam;

      if (teamID === this._spectatorID) {
        this._removedPlayersList.push({
          gameID,
          model: user.model,
        });
      }
    }

    if (teamID !== this._spectatorID) {
      user.isWatching = false;
      user.keySet = 1;
      this.addToActivePlayers(gameID);
      this._stat.updateUser(gameID, teamID, { status: '' });
      data[2] = [this.getRoundTimeLeft()];
    } else {
      user.isWatching = true;
      user.keySet = 0;
      data[2] = [this.getRoundTimeLeft()].concat(
        this._panel.getEmpty(),
      );
    }

    user.socket.send(this._portShot, data);
  }

  // создает кадр игры
  createShot() {
    // обновление данных и физики
    this._game.updateData();

    // список пользователей, у которых готова карта и можно давать игровые данные
    const userList = Object.keys(this._users).filter(
      gameID =>
        this._users[gameID].mapReady === true ||
        this._removedPlayersList.some(item => item.gameID === gameID),
    );

    const game = this._game.getGameData();
    const stat = this._stat.getLast();
    const chat = this._chat.shift();
    const vote = this._vote.shift();

    game[this._currentMapData.setID] = this._game.getDynamicMapData();

    // игроки для удаления с полотна
    while (this._removedPlayersList.length) {
      const user = this._removedPlayersList.pop();
      const model = user.model;

      game[model] = game[model] || {};
      game[model][user.gameID] = null;
    }

    const getUserData = gameID => {
      const user = this._users[gameID];
      const keySet = user.keySet;
      let coords, panel, chatUser, voteUser;

      // TODO проверить работу activePlayer и Panel
      // если статус наблюдателя
      if (user.isWatching === true) {
        panel = 0;

        // если есть играющие пользователи
        if (this._activePlayersList.length) {
          // если наблюдаемый игрок не существует (завершил игру)
          if (!this._users[user.watchedGameID]) {
            user.watchedGameID = this._activePlayersList[0];
          }

          coords = this._game.getUserCoords(user.watchedGameID);
        } else {
          coords = [0, 0];
        }
      } else {
        coords = this._game.getUserCoords(gameID);
        panel = this._panel.getPanel(gameID);
        panel = panel ? [null].concat(panel) : 0;
      }

      // если общих сообщений нет
      if (!chat) {
        chatUser = this._chat.shiftByUser(gameID) || 0;
      } else {
        chatUser = chat;
      }

      // если общих данных для голосования нет
      if (!vote) {
        voteUser = this._vote.shiftByUser(gameID) || 0;
      } else {
        voteUser = vote;
      }

      if (typeof keySet === 'number') {
        user.keySet = null;
        return [
          game,
          coords,
          panel,
          stat,
          chatUser,
          voteUser,
          keySet,
        ];
      } else {
        return [game, coords, panel, stat, chatUser, voteUser];
      }
    };

    // отправка данных
    userList.map(gameID =>
      this._users[gameID].socket.send(
        this._portShot,
        getUserData(gameID),
      ),
    );
  }

  // начало раунда: перемещаем игроков и отправляем первый кадр
  startRound() {
    const respawns = this._currentMapData.respawns;
    const respID = {};

    // очищение списка играющих
    this._activePlayersList = [];

    // удаление всех игроков
    this._game.removeUsers();

    const gameData = this._game.resetBulletData();

    this._game.createMap(this._currentMapData);

    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        const user = this._users[p];
        const gameID = user.gameID;

        this.sendFirstShot(gameID, gameData);

        respID[user.team] = respID[user.team] || 0;
        const data = respawns[user.team];

        // если есть данные для создания модели
        if (data) {
          this._game.createUser(
            gameID,
            user.model,
            user.name,
            user.teamID,
            data[respID[user.team]],
          );
          respID[user.team] += 1;
        }
      }
    }
  }

  // принудительно стартует раунд заново
  restartRound() {
    clearTimeout(this._roundTimer);
    this.startRoundTimer();
  }

  // проверяет имя
  checkName(name, number = 1) {
    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p].name === name) {
          if (number > 1) {
            name =
              name.slice(0, name.lastIndexOf('#')) + '#' + number;
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
  changeName(gameID, name) {
    const user = this._users[gameID];

    if (this._expressions.name.test(name)) {
      name = this.checkName(name);
      user.name = name;
      this._game.changeName(gameID, name);
      this._stat.updateUser(gameID, user.teamID, { name });
      this._chat.pushSystem('n:1', gameID);
      user.socket.send(this._portMisc, {
        key: 'localstorageNameReplace',
        value: name,
      });
    } else {
      this._chat.pushSystem('n:0', gameID);
    }
  }

  // меняет команду игрока
  changeTeam(gameID, team) {
    const user = this._users[gameID];
    let currentTeam = user.team;
    const nextTeam = user.nextTeam;
    const respawns = this._currentMapData.respawns;

    // если команда уже была выбрана
    if (team === nextTeam) {
      if (team !== this._spectatorTeam) {
        this._chat.pushSystem(`s:5:${team}`, gameID);
      } else {
        this._chat.pushSystem('s:6', gameID);
      }

      // иначе если команда является текущей и не изменится в следующем раунде
    } else if (team === currentTeam && nextTeam === null) {
      if (team !== this._spectatorTeam) {
        this._chat.pushSystem(`s:3:${team}`, gameID);
      } else {
        this._chat.pushSystem('s:4', gameID);
      }

      // иначе смена команды
    } else {
      currentTeam = nextTeam !== null ? nextTeam : currentTeam;

      if (team !== this._spectatorTeam) {
        // если количество респаунов на карте в выбраной команде
        // равно количеству игроков в этой команде (смена невозможна)
        if (respawns[team].length === this._teamSizes[team]) {
          if (currentTeam !== this._spectatorTeam) {
            this._chat.pushSystem(
              `s:0:${team},${currentTeam}`,
              gameID,
            );
          } else {
            this._chat.pushSystem(`s:1:${team}`, gameID);
          }

          return;
        } else {
          this._chat.pushSystem(`s:5:${team}`, gameID);
        }
      } else {
        this._chat.pushSystem('s:6', gameID);
      }

      this._teamSizes[currentTeam] -= 1;

      user.nextTeam = team;

      if (this._teamSizes[team]) {
        this._teamSizes[team] += 1;
      } else {
        this._teamSizes[team] = 1;
      }

      // если на сервере 1-2 игрока
      // требуется начать раунд заново
      if (Object.keys(this._users).length <= 2) {
        this.restartRound();
      }
    }
  }

  // проверяет команду на свободные респауны и возвращает сообщение
  checkTeam(team) {
    const respawns = this._currentMapData.respawns;
    let emptyTeam, message;

    // ищет команды имеющие свободные респауны
    const searchEmptyTeam = () => {
      for (const p in respawns) {
        if (respawns.hasOwnProperty(p)) {
          if (respawns[p].length !== this._teamSizes[p]) {
            return p;
          }
        }
      }
    };

    // если команда наблюдателя
    if (team !== this._spectatorTeam) {
      // если количество респаунов на карте в выбраной команде
      // равно количеству игроков в этой команде
      if (respawns[team].length === this._teamSizes[team]) {
        emptyTeam = searchEmptyTeam();

        // если найдена команда с свободным местом
        if (emptyTeam) {
          message = `s:0:${team},${emptyTeam}`;
          team = emptyTeam;
        } else {
          message = 's:2';
          team = this._spectatorTeam;
        }
      } else {
        message = `s:3:${team}`;
      }
    } else {
      message = 's:4';
    }

    if (this._teamSizes[team]) {
      this._teamSizes[team] += 1;
    } else {
      this._teamSizes[team] = 1;
    }

    return { team, message };
  }

  // добавляет в список играющих пользователей
  addToActivePlayers(gameID) {
    if (!this._activePlayersList.includes(gameID)) {
      this._activePlayersList.push(gameID);
    }
  }

  // удаляет из списка играющих пользователей
  removeFromActivePlayers(gameID) {
    for (let i = 0; i < this._activePlayersList.length; i += 1) {
      if (this._activePlayersList[i] === gameID) {
        this._activePlayersList.splice(i, 1);
      }
    }
  }

  // меняет и возвращает gameID наблюдаемого игрока
  getNextActivePlayerForUser(gameID, back) {
    const currentID = this._users[gameID].watchedGameID;
    let key = this._activePlayersList.indexOf(currentID);

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
    } else {
      return this._activePlayersList[0];
    }
  }

  // создает нового игрока
  createUser(params, socket, cb) {
    // подбирает gameID
    const getGameID = () => {
      let gameID = 1;

      while (this._users[gameID]) {
        gameID += 1;
      }
      return gameID;
    };

    const gameID = getGameID();
    const name = this.checkName(params.name);
    const team = this.checkTeam(params.team).team;
    const teamID = this._teams[team];

    // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
    this._users[gameID] = {
      // gameID игрока
      gameID,
      // сокет
      socket: socket,
      // флаг загрузки карты
      mapReady: false,
      // имя пользователя
      name,
      // модель игрока
      model: params.model,
      // название команды
      team,
      // ID команды
      teamID,
      // название команды в следующем раунде
      nextTeam: null,
      // флаг наблюдателя за игрой (true у игроков, которые в текущий момент наблюдают за игрой)
      isWatching: true,
      // ID наблюдаемого игрока
      watchedGameID: this._activePlayersList[0] || null,
      // набор клавиш
      keySet: 0,
    };

    this._chat.addUser(gameID);
    this._vote.addUser(gameID);
    this._stat.addUser(gameID, teamID, { name });
    this._panel.addUser(gameID);

    process.nextTick(() => {
      cb(gameID);
      this.sendMap(gameID);
    });
  }

  // удаляет пользователя (или всех пользователей) из модулей
  removeFromModules(gameID) {
    // если отсутствует параметр, значит нужно сделать для всех пользователей
    if (!gameID) {
      Object.keys(this._users).forEach(gameID =>
        this.removeFromModules(gameID),
      );
      return;
    }

    const user = this._users[gameID];

    // если gameID === undefined,
    // значит пользователь вышел, не успев войти в игру
    if (!user) {
      return;
    }

    const { team, nextTeam } = user;

    this._stat.removeUser(gameID, user.teamID);
    this._chat.removeUser(gameID);
    this._vote.removeUser(gameID);
    this._panel.removeUser(gameID);

    // если не наблюдатель
    if (team !== this._spectatorTeam) {
      // удаляем из модуля game
      this._game.removeUser(gameID);

      // удаляем из списка играющих на полотне
      this.removeFromActivePlayers(gameID);

      // добавляем в список удаляемых игроков у пользователей
      this._removedPlayersList.push({
        gameID,
        model: user.model,
      });
    }

    // обновляем счетчики команд
    this._teamSizes[nextTeam !== null ? nextTeam : team] -= 1;
  }

  // удаляет игрока полностью из игры
  removeUser(gameID) {
    this.removeFromModules(gameID);
    delete this._users[gameID];
  }

  // обновляет команды
  updateKeys(gameID, keys) {
    const user = this._users[gameID];

    if (user.isWatching === true) {
      // next player
      if (keys & this._spectatorKeys.nextPlayer) {
        user.watchedGameID = this.getNextActivePlayerForUser(gameID);

        // prev player
      } else if (keys & this._spectatorKeys.prevPlayer) {
        user.watchedGameID = this.getNextActivePlayerForUser(
          gameID,
          true,
        );
      }
    } else {
      this._game.updateKeys(gameID, keys);
    }
  }

  // добавляет сообщение
  pushMessage(gameID, message) {
    const user = this._users[gameID];

    if (user.mapReady === false) {
      return;
    }

    message = message.replace(this._expressions.message, '');

    if (message) {
      if (message.charAt(0) === '/') {
        this.parseCommand(gameID, message);
      } else {
        this._chat.push(message, user.name, user.teamID);
      }
    }
  }

  // обрабатывает vote-данные пользователя
  parseVote(gameID, data) {
    const user = this._users[gameID];

    if (user.mapReady === false) {
      return;
    }

    // если данные 'строка' (запрос данных)
    if (typeof data === 'string') {
      // если запрос списка команд
      if (data === 'teams') {
        this._vote.pushByUser(gameID, [null, this._teamList]);

        // если запрос всех карт
      } else if (data === 'maps') {
        this._vote.pushByUser(gameID, [null, this._mapList]);

        // если запрос пользователей
      } else if (data === 'users') {
        const dataArr = [];

        for (const p in this._users) {
          if (this._users.hasOwnProperty(p)) {
            dataArr.push(this._users[p].name + ':' + p);
          }
        }
        this._vote.pushByUser(gameID, [null, dataArr]);
      }

      // если данные 'объект' (результат голосования)
    } else if (typeof data === 'object') {
      const type = data[0];
      let value = data[1];

      // если пользователь проголосовал за карту
      if (type === 'changeMap') {
        value = value[0];
        this._vote.addInVote(type, value);
        this._chat.pushSystem('v:0', gameID);

        // иначе если пользователь захотел сменить карту
      } else if (type === 'mapUser') {
        value = value[0];

        // если карта является текущей
        if (value === this._currentMap) {
          this._chat.pushSystem('v:1:' + value, gameID);
        } else {
          // если пользователь один в игре (смена карты)
          if (Object.keys(this._users).length === 1) {
            this._currentMap = value;
            this.createMap();

            // иначе запуск голосования
          } else {
            this.changeMap(gameID, value);
          }
        }

        // иначе если смена статуса
      } else if (type === 'team') {
        this.changeTeam(gameID, value[0]);
      }
    }
  }

  // отправляет голосование за новую карту
  changeMap(gameID, map) {
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

      // если есть gameID и карта (голосование создает пользователь)
      if (typeof gameID !== 'undefined' && typeof map === 'string') {
        const arr = [
          this._users[gameID].name + ' предложил карту: ' + map,
          ['Сменить:' + map, 'Не менять:'],
          null,
        ];

        const userList = [];

        for (const p in this._users) {
          if (this._users.hasOwnProperty(p)) {
            const id = this._users[p].gameID;

            if (id !== gameID) {
              userList.push(id);
            }
          }
        }

        this._vote.createVote('changeMap', arr, userList);
        this._vote.addInVote('changeMap', map);
        this._chat.pushSystem('v:2', gameID);

        // иначе голосование создает игра
      } else {
        const arr = ['Выберете следующую карту', getMapList(), null];
        this._vote.createVote('changeMap', arr);
      }

      // собирает результаты голосования и стартует новую игру
      setTimeout(() => {
        const map = this._vote.getResult('changeMap');

        // если есть результат и карта существует
        if (map && this._maps[map]) {
          this._chat.pushSystem('v:4:' + map);

          setTimeout(() => {
            this._currentMap = map;
            this.createMap();
          }, 2000);
        } else {
          this._chat.pushSystem('v:5');
        }

        // снимает блокировку смены карты
        setTimeout(() => {
          this._blockedRemap = false;
        }, this._timeBlockedRemap);
      }, this._voteTime);
    } else {
      if (typeof gameID !== 'undefined') {
        this._chat.pushSystem('v:3', gameID);
      }
    }
  }

  // обрабатывает команду от пользователя
  parseCommand(gameID, message) {
    message = message.replace(/\s\s+/g, ' ');

    const arr = message.split(' ');
    const cmd = arr.shift();
    const value = arr.join(' ');

    switch (cmd) {
      // приглашение друга
      case '/invite':
        if (this._expressions.email.test(value)) {
          this._email.invite(value, err => {
            if (err) {
              this._chat.pushSystem('i:2', gameID);
            } else {
              this._chat.pushSystem('i:1', gameID);
            }
          });
        } else {
          this._chat.pushSystem('i:0', gameID);
        }
        break;

      // смена ника
      case '/name':
        this.changeName(gameID, value);
        break;

      // новый раунд
      case '/nr':
        this.restartRound();
        break;

      // время карты
      case '/timeleft':
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
          [getTime(this.getMapTimeLeft())],
          gameID,
        );
        break;

      // название текущей карты
      case '/mapname':
        this._chat.pushSystem([this._currentMap], gameID);
        break;

      default:
        this._chat.pushSystem(['Command not found'], gameID);
    }
  }
}

export default VIMP;
