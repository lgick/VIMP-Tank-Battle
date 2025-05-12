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
    this._currentMap = data.currentMap; // название текущей карты
    this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя

    this._expressions = {
      name: new RegExp(data.expressions.name),
      message: new RegExp(data.expressions.message, 'g'),
    };

    this._mapTime = data.mapTime; // продолжительность карты
    this._roundTime = data.roundTime; // продолжительность раунда
    this._voteTime = data.voteTime; // время голосования
    this._timeBlockedRemap = data.timeBlockedRemap;

    this._timeStep = data.timeStep; // время обновления кадра игры
    this._lastShotTime = Date.now();

    this._users = {}; // игроки

    // команды
    this._teams = data.teams; // team: teamID; { team1: 1, team2: 2, spectators: 3 }
    // название команды наблюдателя
    this._spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this._spectatorID = this._teams[this._spectatorTeam];
    // количество игроков в командах
    this._teamSizes = {}; // { team1: 0, team2: 0, spectators: 0 }

    // список gameID активных игроков на полотне
    this._activePlayersList = [];
    // список gameID игроков для удаления с полотна
    this._removedPlayersList = [];

    this._portConfig = ports.config;
    this._portAuth = ports.auth;
    this._portAuthErr = ports.authErr;
    this._portMap = ports.map;
    this._portShot = ports.shot;
    this._portInform = ports.inform;
    this._portMisc = ports.misc;
    this._portClear = ports.clear;
    this._portLog = ports.log;

    this._currentMapData = null; // данные текущей карты

    this._roundTimer = null;
    this._stepTimer = null;
    this._mapTimer = null;
    this._changeMapTimer = null;
    this._blockedRemapTimer = null;

    this._startMapTime = 0; // время запуска карты
    this._startRoundTime = 0; // время запуска раунда

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
      this._timeStep / 1000,
    );

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
    clearInterval(this._stepTimer);
    // останавливает раунд
    clearTimeout(this._roundTimer);
    // останавливает карту
    clearTimeout(this._mapTimer);
  }

  // стартует карту
  startMapTimer() {
    this._startMapTime = Date.now();

    this._mapTimer = setTimeout(() => {
      clearTimeout(this._changeMapTimer);
      clearTimeout(this._blockedRemapTimer);
      this._blockedRemap = false;
      this.changeMap();
    }, this._mapTime);
  }

  // стартует раунд
  startRoundTimer() {
    this._startRoundTime = Date.now();

    this.startRound();

    this._roundTimer = setTimeout(() => {
      this.startRoundTimer();
      this._chat.pushSystem('t:1');
    }, this._roundTime);
  }

  // стартует расчет кадров игры
  startShotTimer() {
    this._lastShotTime = Date.now();

    this._stepTimer = setInterval(() => {
      const now = Date.now();
      const dt = (now - this._lastShotTime) / 1000;
      this._lastShotTime = now;

      this.sendShot(dt);
    }, this._timeStep);
  }

  // возвращает оставшееся время раунда (seconds)
  getRoundTimeLeft() {
    let timeLeft = this._roundTime - (Date.now() - this._startRoundTime);

    timeLeft = Math.floor(timeLeft / 1000 - 3);

    return timeLeft < 0 ? 0 : timeLeft;
  }

  // возвращает оставшееся время карты (ms)
  getMapTimeLeft() {
    const timeLeft = this._mapTime - (Date.now() - this._startMapTime);

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

    this.resetTeamSizes();

    this._activePlayersList = [];
    this._removedPlayersList = [];

    this._panel.reset();
    this._stat.reset();
    this._vote.reset();

    this._game.clear();
    this._game.createMap(this._currentMapData);

    for (const gameID in this._users) {
      if (this._users.hasOwnProperty(gameID)) {
        const user = this._users[gameID];

        user.socket.send(this._portClear);

        // перемещение пользователя в наблюдатели
        this._stat.moveUser(gameID, user.teamID, this._spectatorID);

        // обнулить параметры
        user.team = this._spectatorTeam;
        user.teamID = this._spectatorID;
        user.nextTeam = null;
        user.isWatching = true;
        user.watchedGameID = null;
      }
    }

    this.sendMap();
    this.startGameTimers();
  }

  // отправляет карту либо конкретному игроку, либо всем
  sendMap(gameID) {
    if (gameID) {
      let user = this._users[gameID];

      user.socket.send(this._portInform, [2]);
      user.mapReady = false;
      user.currentMap = this._currentMap;
      user.socket.send(this._portMap, this._currentMapData);
    } else {
      for (const p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          let user = this._users[p];

          user.socket.send(this._portInform, [2]);
          user.mapReady = false;
          user.currentMap = this._currentMap;
          user.socket.send(this._portMap, this._currentMapData);
        }
      }
    }
  }

  // сообщает о загрузке карты
  mapReady(err, gameID) {
    const user = this._users[gameID];

    if (!err && user.mapReady === false) {
      // если карта загруженая пользователем совпадает с картой сервера
      if (user.currentMap === this._currentMap) {
        // скрывает экран загрузки
        user.socket.send(this._portInform);
        user.mapReady = true;

        // отправка первого shot
        user.socket.send(this._portShot, [
          this._game.getFullPlayersData(), // game
          0, // coords
          [this.getRoundTimeLeft()], // panel: для наблюдателя только время раунда
          this._stat.getFull(), // stat
          0, // chat
          [
            ['team', true],
            ['Выберите команду', Object.keys(this._teams), null],
          ], // vote: опрос выбора команды
        ]);

        // иначе загрузить актуальную карту
      } else {
        this.sendMap(gameID);
      }
    }
  }

  // создает кадр игры
  sendShot(dt) {
    // обновление данных и физики
    this._game.updateData(dt);

    // список пользователей с готовой картой
    const userList = Object.keys(this._users).filter(
      gameID => this._users[gameID].mapReady === true,
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
      let coords, panel, chatUser, voteUser;

      // TODO проверить работу activePlayer и Panel
      // если игрок наблюдает за игрой
      if (user.isWatching === true) {
        panel = 0;

        // если есть играющие пользователи
        if (this._activePlayersList.length) {
          // если наблюдаемый игрок не существует (завершил игру)
          if (!this._users[user.watchedGameID]) {
            user.watchedGameID = this._activePlayersList[0];
          }

          coords = this._game.getPlayerCoords(user.watchedGameID);
        } else {
          coords = [0, 0];
        }
      } else {
        coords = this._game.getPlayerCoords(gameID);
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

      return [game, coords, panel, stat, chatUser, voteUser];
    };

    // отправка данных
    userList.forEach(gameID =>
      this._users[gameID].socket.send(this._portShot, getUserData(gameID)),
    );
  }

  // начало раунда: перемещаем игроков и отправляем первый кадр
  startRound() {
    const respawns = this._currentMapData.respawns;
    const respID = {};
    const fullStatData = this._stat.getFull();

    // очищение списка играющих
    this._activePlayersList = [];

    this._panel.reset();

    const setIDList = this._game.removePlayersAndShots();

    this._game.createMap(this._currentMapData);

    for (const gameID in this._users) {
      if (this._users.hasOwnProperty(gameID)) {
        const user = this._users[gameID];

        if (user.mapReady === false) {
          continue;
        }

        user.socket.send(this._portClear, setIDList);

        const firstShotData = [
          {}, // game
          0, // coords
          0, // panel
          fullStatData, // stat
          0, // chat
          0, // vote
        ];

        const nextTeam = user.nextTeam;
        let teamID = user.teamID;

        // если пользователь сменил команду
        if (nextTeam !== null) {
          user.nextTeam = null;

          // перемещение пользователя в статистике
          this._stat.moveUser(gameID, teamID, this._teams[nextTeam]);

          teamID = user.teamID = this._teams[nextTeam];
          user.team = nextTeam;

          // если пользователь стал наблюдателем
          // нужно добавить его в списки удаляемых
          // и убрать из списков наблюдаемых
          if (teamID === this._spectatorID) {
            this._removedPlayersList.push({
              gameID,
              model: user.model,
            });

            this.removeFromActivePlayers(gameID);
          }
        }

        if (teamID !== this._spectatorID) {
          user.isWatching = false;
          firstShotData[2] = [this.getRoundTimeLeft()];
          firstShotData[6] = 1; // keySet игрока
          this.addToActivePlayers(gameID);
          this._stat.updateUser(gameID, teamID, { status: '' });
        } else {
          user.isWatching = true;
          firstShotData[2] = [this.getRoundTimeLeft()].concat(
            this._panel.getEmpty(),
          );
          firstShotData[6] = 0; // keySet наблюдателя
        }

        // отправка первого кадра
        user.socket.send(this._portShot, firstShotData);

        respID[user.team] = respID[user.team] || 0;
        const data = respawns[user.team];

        // если есть данные для создания модели
        if (data) {
          this._game.createPlayer(
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
  changeName(gameID, name) {
    const user = this._users[gameID];
    const oldName = user.name;

    if (this._expressions.name.test(name)) {
      name = this.checkName(name);
      user.name = name;
      this._game.changeName(gameID, name);
      this._stat.updateUser(gameID, user.teamID, { name });
      this._chat.pushSystem(`n:1:${oldName},${name}`);
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
            this._chat.pushSystem(`s:0:${team},${currentTeam}`, gameID);
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

      this._teamSizes[team] += 1;

      // если на сервере менее 2-х активных игроков
      // требуется начать раунд заново
      if (this._activePlayersList.filter(id => id !== gameID).length < 2) {
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

    this._teamSizes[team] += 1;

    return { team, message };
  }

  // сбрасывает this._teamSizes в нулевые значения
  resetTeamSizes() {
    this._teamSizes = Object.keys(this._teams).reduce((acc, key) => {
      acc[key] = 0;
      return acc;
    }, {});
  }

  // добавляет в список играющих пользователей
  addToActivePlayers(gameID) {
    if (!this._activePlayersList.includes(gameID)) {
      this._activePlayersList.push(gameID);
    }
  }

  // удаляет из списка играющих пользователей
  removeFromActivePlayers(gameID) {
    this._activePlayersList = this._activePlayersList.filter(
      id => id !== gameID,
    );

    // удаление из watchedGameID других игроков
    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p].watchedGameID === gameID) {
          this._users[p].watchedGameID = this._activePlayersList[0] || null;
        }
      }
    }
  }

  // меняет и возвращает gameID наблюдаемого игрока
  getNextActivePlayerForUser(gameID, back) {
    const currentID = this._users[gameID]?.watchedGameID;
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
      return this._activePlayersList[0] || null;
    }
  }

  // создает нового игрока
  createUser(params, socket, cb) {
    // подбирает gameID
    const getGameID = () => {
      let counter = 0;

      while (this._users[counter.toString(10)]) {
        counter += 1;
      }
      return counter.toString(10);
    };

    const gameID = getGameID();
    const name = this.checkName(params.name);

    // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
    this._users[gameID] = {
      // gameID игрока
      gameID,
      // сокет
      socket: socket,
      // флаг загрузки карты
      mapReady: false,
      // текущая карта игры. Важно, чтоб этот параметр совпадал с актуальной картой сервера
      currentMap: null,
      // имя пользователя
      name,
      // модель игрока
      model: params.model,
      // название команды
      team: this._spectatorTeam,
      // ID команды
      teamID: this._spectatorID,
      // название команды в следующем раунде
      nextTeam: null,
      // флаг наблюдателя за игрой (true у игроков, которые в текущий момент наблюдают за игрой)
      isWatching: true,
      // ID наблюдаемого игрока
      watchedGameID: this._activePlayersList[0] || null,
    };

    this._chat.addUser(gameID);
    this._vote.addUser(gameID);
    this._stat.addUser(gameID, this._spectatorID, { name });
    this._panel.addUser(gameID);

    process.nextTick(() => {
      cb(gameID);
      this.sendMap(gameID);
    });
  }

  // удаляет игрока полностью из игры
  removeUser(gameID) {
    const user = this._users[gameID];
    const { team, teamID, model, nextTeam } = user;

    this._stat.removeUser(gameID, teamID);
    this._chat.removeUser(gameID);
    this._vote.removeUser(gameID);
    this._panel.removeUser(gameID);

    // если не наблюдатель
    if (team !== this._spectatorTeam) {
      // удаляем из модуля game
      this._game.removePlayer(gameID);

      // удаляем из списка играющих на полотне
      this.removeFromActivePlayers(gameID);

      // добавляем в список удаляемых игроков у пользователей
      this._removedPlayersList.push({
        gameID,
        model,
      });
    }

    // обновляем счетчики команд
    this._teamSizes[nextTeam !== null ? nextTeam : team] -= 1;

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
        user.watchedGameID = this.getNextActivePlayerForUser(gameID, true);
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
        this._vote.pushByUser(gameID, [null, Object.keys(this._teams)]);

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
  changeMap(gameID, mapName) {
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
      if (typeof gameID !== 'undefined' && typeof mapName === 'string') {
        const arr = [
          this._users[gameID].name + ' предложил карту: ' + mapName,
          ['Сменить:' + mapName, 'Не менять:'],
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

        this._vote.createVote([['changeMap'], arr], userList);
        this._vote.addInVote('changeMap', mapName);
        this._chat.pushSystem('v:2', gameID);

        // иначе голосование создает игра
      } else {
        const arr = ['Выберете следующую карту', getMapList(), null];
        this._vote.createVote([['changeMap'], arr]);
      }

      // собирает результаты голосования и стартует новую игру
      this._changeMapTimer = setTimeout(() => {
        const mapName = this._vote.getResult('changeMap');

        if (mapName === null) {
          return;
        }

        // если есть результат и карта существует
        if (this._maps[mapName]) {
          this._chat.pushSystem('v:4:' + mapName);

          setTimeout(() => {
            this._currentMap = mapName;
            this.createMap();
          }, 2000);
        } else {
          // если голосование создаёт игра, требуется обновить время карты
          if (typeof gameID === 'undefined') {
            clearTimeout(this._mapTimer);
            this.startMapTimer();
          }

          this._chat.pushSystem('v:5');
          this._chat.pushSystem('t:0:' + this._currentMap);
        }

        // снимает блокировку смены карты
        this._blockedRemapTimer = setTimeout(() => {
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

        this._chat.pushSystem([getTime(this.getMapTimeLeft())], gameID);
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
