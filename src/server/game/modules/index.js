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
    this._portClear = ports.clear;
    this._portLog = ports.log;

    this._users = {}; // игроки
    this._currentMapData = null; // данные текущей карты

    this._roundTimer = null;
    this._shotTimer = null;
    this._mapTimer = null;

    this._startMapTime = 0; // время запуска карты
    this._startRoundTime = 0; // время запуска раунда

    this._allUsersInTeam = {}; // количество игроков в команде
    this._playersList = []; // список играющих (у кого lookOnly === false)
    this._removeList = []; // список удаленных игроков

    this._blockedRemap = false; // флаг блокировки голосования за новую карту
    this._startMapNumber = 0; // номер первой карты в голосовании

    this._panel = new Panel(data.panel);
    this._stat = new Stat(data.stat, this._teams);
    this._chat = new Chat();
    this._vote = new Vote();
    this._game = new Game(data.factory, data.parts, data.keys, data.shotTime);

    this._email = data.email;

    // Запускаем первую карту
    this.initMap();
  }

  // стартует игру
  startGame() {
    this.startMapTimer();
    this.startShotTimer();
    this.startRoundTimer();
  }

  // останавливает игру
  stopGame() {
    console.log('stop all timers');
    clearInterval(this._shotTimer);
    clearTimeout(this._roundTimer);
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

  // останавливает карту
  stopMapTimer() {
    console.log('map timer stop');
    clearTimeout(this._mapTimer);
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

  // останавливает раунд
  stopRoundTimer() {
    console.log('round timer stop');
    clearTimeout(this._roundTimer);
  }

  // стартует расчет кадров игры
  startShotTimer() {
    this._shotTimer = setInterval(() => {
      this.createShot();
    }, this._shotTime);
  }

  // останавливает расчет кадров игры
  stopShotTimer() {
    console.log('shot timer stop');
    clearInterval(this._shotTimer);
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

  // инициализирует карту
  initMap() {
    this._currentMapData = this._maps[this._currentMap];

    // если нет индивидуального конструктора для создания карты
    if (!this._currentMapData.setID) {
      this._currentMapData.setID = this._mapSetID;
    }

    this.stopGame();
    this._allUsersInTeam = {};
    this._stat.reset();
    this._game.clear();

    this._game.createMap(this._currentMapData);

    // корректирование статуса игроков под новые респауны
    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        let user = this._users[p];
        let teamData = this.checkTeam(user.team);

        // если текущая команда не свободна
        if (user.team !== teamData.team) {
          user.nextTeam = teamData.team;
        }

        this._chat.pushSystem(teamData.message, user.gameID);
      }
    }

    this.sendMap();
    this.startGame();
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
      // если есть необходимость в полной загрузке game-данных
      if (user.fullGameData === true) {
        user.fullGameData = false;
        user.socket.send(this._portShot, [
          this._game.getFullUsersData(),
          0,
          0,
          0,
          0,
          0,
        ]);
      }

      user.socket.send(this._portInform);
      user.mapReady = true;
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
        this._removeList.push({
          gameID,
          model: user.model,
        });
      }
    }

    if (teamID !== this._spectatorID) {
      user.lookOnly = false;
      user.keySet = 1;
      this._playersList.push(gameID);
      this._stat.updateUser(gameID, teamID, { status: '' });
      data[2] = [this.getRoundTimeLeft()];
    } else {
      user.lookOnly = true;
      user.keySet = 0;
      data[2] = [this.getRoundTimeLeft()].concat(this._panel.getEmpty());
    }

    user.socket.send(this._portShot, data);
  }

  // создает кадр игры
  createShot() {
    // обновление данных и физики
    this._game.updateData();

    const game = this._game.getGameData();
    const stat = this._stat.getLast();
    const chat = this._chat.shift();
    const vote = this._vote.shift();

    game[this._currentMapData.setID] = this._game.getDynamicMapData();

    // игроки для удаления с полотна
    while (this._removeList.length) {
      const user = this._removeList.pop();
      const model = user.model;

      game[model] = game[model] || {};
      game[model][user.gameID] = null;
    }

    const getUserData = gameID => {
      const user = this._users[gameID];
      const keySet = user.keySet;
      let coords, panel, chatUser, voteUser;

      // если карта готова
      const gameUser = user.mapReady === true ? game : 0;

      // TODO проверить работу lookUser и Panel
      // если статус наблюдателя
      if (user.lookOnly === true) {
        panel = 0;

        // если есть наблюдаемые
        if (this._playersList.length) {
          let lookUser = this._users[user.lookID];

          // если наблюдаемый игрок не существует (завершил игру)
          if (!lookUser) {
            this.changeLookID(gameID);
            lookUser = this._users[user.lookID];
          }

          coords = this._game.getUserCoords(lookUser.gameID);
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
        return [gameUser, coords, panel, stat, chatUser, voteUser, keySet];
      } else {
        return [gameUser, coords, panel, stat, chatUser, voteUser];
      }
    };

    // отправка данных
    for (const p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        this._users[p].socket.send(this._portShot, getUserData(p));
      }
    }
  }

  // начало раунда: перемещаем игроков и отправляем первый кадр
  startRound() {
    const respawns = this._currentMapData.respawns;
    const respID = {};

    // очищение списка играющих
    this._playersList = [];

    // удаление всех игроков
    this._game.removeUsers();

    // сбрасывание динамических элементов карты в первоначальный вид
    this._game.resetDynamicMapData();

    const gameData = this._game.resetBulletData();
    // gameData[this._currentMapData.setID] = this._game.getDynamicMapData();

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

  // заканчивает раунд
  stopRound() {}

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

    if (this._expressions.name.test(name)) {
      name = this.checkName(name);
      user.name = name;
      this._game.changeName(gameID, name);
      this._stat.updateUser(gameID, user.teamID, { name });
      this._chat.pushSystem('n:1', gameID);
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
        if (respawns[team].length === this._allUsersInTeam[team]) {
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

      this._allUsersInTeam[currentTeam] -= 1;

      user.nextTeam = team;

      if (this._allUsersInTeam[team]) {
        this._allUsersInTeam[team] += 1;
      } else {
        this._allUsersInTeam[team] = 1;
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
          if (respawns[p].length !== this._allUsersInTeam[p]) {
            return p;
          }
        }
      }
    };

    // если команда наблюдателя
    if (team !== this._spectatorTeam) {
      // если количество респаунов на карте в выбраной команде
      // равно количеству игроков в этой команде
      if (respawns[team].length === this._allUsersInTeam[team]) {
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

    if (this._allUsersInTeam[team]) {
      this._allUsersInTeam[team] += 1;
    } else {
      this._allUsersInTeam[team] = 1;
    }

    return { team, message };
  }

  // удаляет из списка наблюдаемых игроков
  removeFromLookIDList(gameID) {
    for (let i = 0; i < this._playersList.length; i += 1) {
      if (this._playersList[i] === gameID) {
        this._playersList.splice(i, 1);
      }
    }
  }

  // меняет или назначает ID наблюдаемого игрока
  changeLookID(gameID, back) {
    const currentID = this._users[gameID].lookID;
    let key = this._playersList.indexOf(currentID);
    let lookID;

    // если есть наблюдаемый игрок
    if (key !== -1) {
      // если поиск назад
      key = back ? key - 1 : key + 1;

      if (key < 0) {
        key = this._playersList.length - 1;
      } else if (key >= this._playersList.length) {
        key = 0;
      }

      lookID = this._playersList[key];
    } else {
      lookID = this._playersList[0];
    }

    this._users[gameID].lookID = lookID;
  }

  // создает нового игрока
  createUser(params, socket, cb) {
    let { name, team, model } = params;
    const data = [];

    data[0] = {}; // game
    data[1] = 0; // coords
    data[2] = 0; // panel
    data[3] = 0; // stat
    data[4] = 0; // chat
    data[5] = 0; // vote

    // подбирает gameID
    const getGameID = () => {
      let gameID = 1;

      while (this._users[gameID]) {
        gameID += 1;
      }
      return gameID;
    };

    name = this.checkName(name);
    const gameID = getGameID();
    const teamData = this.checkTeam(team);

    team = teamData.team;
    const teamID = this._teams[team];

    const user = (this._users[gameID] = {});

    // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
    // сокет
    user.socket = socket;
    // флаг полной загрузки game-данных для пользователя
    user.fullGameData = true;
    // флаг загрузки текущей карты
    user.mapReady = false;
    // имя пользователя
    user.name = name;
    // название команды
    user.team = team;
    // модель игрока
    user.model = model;
    // название команды в следующем раунде
    user.nextTeam = null;
    // ID команды
    user.teamID = teamID;
    // gameID игрока
    user.gameID = gameID;
    // флаг наблюдателя игры
    user.lookOnly = true;
    // ID наблюдаемого игрока
    user.lookID = null;
    // набор клавиш
    user.keySet = 0;
    // набор нажатых клавиш
    user.keys = null;

    this._chat.addUser(gameID);
    this._vote.addUser(gameID);
    this._stat.addUser(gameID, teamID, { name });
    this._panel.addUser(gameID);

    this.changeLookID(gameID);

    data[1] = [0, 0];
    data[2] = [this.getRoundTimeLeft()];
    data[3] = this._stat.getFull();
    data[4] = teamData.message;

    user.socket.send(this._portShot, data);

    process.nextTick(() => {
      cb(gameID);
      this.sendMap(gameID);
    });
  }

  // удаляет игрока
  removeUser(gameID, cb) {
    let bool = false;
    const user = this._users[gameID];

    // если gameID === undefined,
    // значит пользователь вышел, не успев войти в игру
    if (user) {
      const { team, nextTeam } = user;

      this._stat.removeUser(gameID, user.teamID);
      this._allUsersInTeam[nextTeam !== null ? nextTeam : team] -= 1;

      // если игрок - наблюдатель, то удалить
      if (team === this._spectatorTeam) {
        delete this._users[gameID];

        // иначе начать удаление
      } else {
        this.removeFromLookIDList(gameID);
        this._panel.removeUser(gameID);
        this._game.removeUser(gameID);

        this._removeList.push({
          gameID,
          model: user.model,
        });

        delete this._users[gameID];
      }

      this._chat.removeUser(gameID);
      this._vote.removeUser(gameID);

      bool = true;
    }

    process.nextTick(() => {
      cb(bool);
    });
  }

  // обновляет команды
  updateKeys(gameID, keys) {
    const user = this._users[gameID];

    if (user.lookOnly === true) {
      // next player
      if (keys & this._spectatorKeys.nextPlayer) {
        this.changeLookID(gameID);

        // prev player
      } else if (keys & this._spectatorKeys.prevPlayer) {
        this.changeLookID(gameID, true);
      }
    } else {
      this._game.updateKeys(gameID, keys);
    }
  }

  // добавляет сообщение
  pushMessage(gameID, message) {
    const user = this._users[gameID];

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
            this.initMap();

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
            this.initMap();
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
        this.stopRoundTimer();
        this.startRoundTimer();
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
