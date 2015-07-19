var Panel = require('./panel');
var Stat = require('./stat');
var Chat = require('./chat');
var Vote = require('./vote');
var Game = require('./game');

// Singleton
var vimp;

function VIMP(data, ports) {
  if (vimp) {
    return vimp;
  }

  vimp = this;

  this._maps = data.maps;                   // карты
  this._mapList = Object.keys(this._maps);  // список карт массивом
  this._mapsInVote = data.mapsInVote;       // карт в голосовании
  this._mapSetID = data.mapSetID;           // дефолтный id конструктора карт
  this._defaultBullet = data.defaultBullet; // дефолтные значения пуль моделей
  this._currentMap = data.currentMap;       // название текущей карты
  this._spectatorKeys = data.spectatorKeys; // клавиши наблюдателя

  // регулярные выражения
  this._expressions = {
    name: new RegExp(data.expressions.name),
    message: new RegExp(data.expressions.message, 'g'),
    email: new RegExp(data.expressions.email, 'i')
  };

  this._mapTime = data.mapTime;             // продолжительность карты
  this._shotTime = data.shotTime;           // время обновления кадра игры
  this._roundTime = data.roundTime;         // продолжительность раунда
  this._voteTime = data.voteTime;           // время голосования
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

  this._users = {};              // игроки
  this._currentMapData = null;   // данные текущей карты

  this._stepTimer = null;
  this._roundTimer = null;
  this._shotTimer = null;
  this._mapTimer = null;

  this._time = 0;                // текущее время раунда

  this._allUsersInTeam = {};     // количество игроков в команде
  this._playersList = [];        // список играющих (у кого lookOnly === false)
  this._removeList = [];         // список удаленных игроков

  this._blockedRemap = false;    // флаг блокировки голосования за новую карту
  this._startMapNumber = 0;      // номер первой карты в голосовании

  this._panel = new Panel(data.panel);
  this._stat = new Stat(data.stat, this._teams);
  this._chat = new Chat();
  this._vote = new Vote();
  this._game = new Game(data.factory, data.parts, data.keys, data.shotTime);

  this._email = data.email;

  this.initMap();
}

// стартует игру
VIMP.prototype.startGame = function () {
  this.startMapTimer();
  this.startShotTimer();
  this.startRoundTimer();
};

// останавливает игру
VIMP.prototype.stopGame = function () {
  console.log('stop all timers');
  clearInterval(this._stepTimer);
  clearInterval(this._shotTimer);
  clearTimeout(this._roundTimer);
  clearTimeout(this._mapTimer);
};

// стартует карту
VIMP.prototype.startMapTimer = function () {
  this._chat.pushSystem('t:0');

  this._mapTimer = setTimeout((function () {
    this.sendMap();
  }).bind(this), this._mapTime);
};

// останавливает карту
VIMP.prototype.stopMapTimer = function () {
  console.log('map timer stop');
  clearTimeout(this._mapTimer);
};

// стартует раунд
VIMP.prototype.startRoundTimer = function () {
  this._time = this._roundTime / 1000 - 3;

  this._stepTimer = setInterval((function () {
    if (this._time > 0) {
      this._time -= 1;
    }
  }).bind(this), 1000);

  this.startRound();
  this._panel.reset();

  this._roundTimer = setTimeout((function () {
    clearInterval(this._stepTimer);

    this.startRoundTimer();
    this._chat.pushSystem('t:1');
  }).bind(this), this._roundTime);
};

// останавливает раунд
VIMP.prototype.stopRoundTimer = function () {
  console.log('round timer stop');
  clearTimeout(this._roundTimer);
};

// стартует расчет кадров игры
VIMP.prototype.startShotTimer = function () {
  this._shotTimer = setInterval((function () {
    this.createShot();
  }).bind(this), this._shotTime);
};

// останавливает расчет кадров игры
VIMP.prototype.stopShotTimer = function () {
  console.log('shot timer stop');
  clearInterval(this._shotTimer);
};

// инициализирует карту
VIMP.prototype.initMap = function () {
  var p
    , user
    , teamData;

  this._currentMapData = this._maps[this._currentMap];

  // если нет индивидуального конструктора для создания карты
  if (!this._currentMapData.setID) {
    this._currentMapData.setID = this._mapSetID;
  }

  this.stopGame();
  this._allUsersInTeam = {};
  this._stat.reset();
  this._game.clear();

  this._game.initMap(this._currentMapData);

  // корректирование статуса игроков под новые респауны
  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];

      teamData = this.checkTeam(user.team);

      // если текущая команда не свободна
      if (user.team !== teamData.team) {
        user.nextTeam = teamData.team;
      }

      this._chat.pushSystem(teamData.message, user.gameID);
    }
  }

  this.sendMap();
  this.startGame();
};

// отправляет карту
VIMP.prototype.sendMap = function (gameID) {
  var p
    , user;

  if (gameID) {
    user = this._users[gameID];

    user.socket.send(this._portInform, [3]);
    user.mapReady = false;
    user.socket.send(this._portMap, this._currentMapData);
  } else {
    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        user = this._users[p];

        user.socket.send(this._portInform, [3]);
        user.mapReady = false;
        user.socket.send(this._portMap, this._currentMapData);
      }
    }
  }
};

// сообщает о загрузке карты
VIMP.prototype.mapReady = function (err, gameID) {
  var user = this._users[gameID];

  if (!err) {
    // если есть необходимость в полной загрузке game-данных
    if (user.fullGameData === true) {
      user.fullGameData = false;
      user.socket.send(this._portShot, [
        this._game.getFullUsersData(), 0, 0, 0, 0, 0
      ]);
    }

    user.socket.send(this._portInform);
    user.mapReady = true;
  }
};

// отправляет первый shot (в начале каждого раунда)
VIMP.prototype.sendFirstShot = function (gameID, gameData) {
  var user = this._users[gameID]
    , nextTeam = user.nextTeam
    , teamID = user.teamID
    , data = [];

  data[0] = gameData || {};     // game
  data[1] = 0;                  // coords
  data[2] = 0;                  // panel
  data[3] = 0;                  // stat
  data[4] = 0;                  // chat
  data[5] = 0;                  // vote

  // если пользователь сменил команду
  if (nextTeam !== null) {
    user.nextTeam = null;

    // перемещение пользователя в статистике
    this._stat.moveUser(gameID, teamID, this._teams[nextTeam]);

    teamID = user.teamID = this._teams[nextTeam];
    user.team = nextTeam;

    if (teamID === this._spectatorID) {
      this._removeList.push({
        gameID: gameID,
        model: user.model
      });
    }
  }

  if (teamID !== this._spectatorID) {
    user.lookOnly = false;
    user.keySet = 1;
    this._playersList.push(gameID);
    this._stat.updateUser(gameID, teamID, {status: ''});
    data[2] = [this._time];
  } else {
    user.lookOnly = true;
    user.keySet = 0;
    data[2] = [this._time].concat(this._panel.getEmpty());
  }

  user.socket.send(this._portShot, data);
};

// создает кадр игры
VIMP.prototype.createShot = function () {
  var game = 0
    , stat = 0
    , chat = 0
    , vote = 0
    , user
    , model
    , p
  ;

  // обновление данных и физики
  this._game.updateData();

  game = this._game.getGameData();
  stat = this._stat.getLast();
  chat = this._chat.shift();
  vote = this._vote.shift();

  // игроки для удаления с полотна
  while (this._removeList.length) {
    user = this._removeList.pop();
    model = user.model;

    game[model] = game[model] || {};
    game[model][user.gameID] = null;
  }

  function getUserData(gameID) {
    var user = this._users[gameID]
      , keySet = user.keySet
      , lookUser
      , coords
      , panel
      , chatUser
      , voteUser
    ;

    // TODO проверить работу lookUser и Panel
    // если статус наблюдателя
    if (user.lookOnly === true) {
      panel = 0;

      // если есть наблюдаемые
      if (this._playersList.length) {
        lookUser = this._users[user.lookID];

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

      if (panel) {
        panel = [null].concat(panel);
      } else {
        panel = 0;
      }
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
      return [game, coords, panel, stat, chatUser, voteUser, keySet];
    } else {
      return [game, coords, panel, stat, chatUser, voteUser];
    }
  }

  // отправка данных
  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      this._users[p].socket.send(this._portShot, getUserData.call(this, p));
    }
  }
};

// стартует раунд
// перемещает игроков на респауны и отправляет первый shot
VIMP.prototype.startRound = function () {
  var respawns = this._currentMapData.respawns
    , p
    , user
    , data
    , respID = {}
    , gameID
    , oldBulletData;

  // очищение списка играющих
  this._playersList = [];

  // удаление всех игроков
  this._game.removeUsers();
  // сбрасывание карты в первоначальный вид
  this._game.resetMap();
  oldBulletData = this._game.resetBulletData();

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];
      gameID = user.gameID;

      this.sendFirstShot(gameID, oldBulletData);

      respID[user.team] = respID[user.team] || 0;
      data = respawns[user.team];

      // если есть данные для создания модели
      if (data) {
        data = data[respID[user.team]];
        this._game.createUser(
          gameID, user.model, user.name, user.teamID, data
        );
        respID[user.team] += 1;
      }
    }
  }
};

// заканчивает раунд
VIMP.prototype.stopRound = function () {
};

// проверяет имя
VIMP.prototype.checkName = function (name, number) {
  var p;

  number = number || 1;

  for (p in this._users) {
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
};

// меняет ник игрока
VIMP.prototype.changeName = function (gameID, name) {
  var user = this._users[gameID];

  if (this._expressions.name.test(name)) {
    name = this.checkName(name);
    user.name = name;
    this._game.changeName(gameID, name);
    this._stat.updateUser(gameID, user.teamID, {name: name});
    this._chat.pushSystem('n:1', gameID);
  } else {
    this._chat.pushSystem('n:0', gameID);
  }
};

// меняет команду игрока
VIMP.prototype.changeTeam = function (gameID, team) {
  var user = this._users[gameID]
    , currentTeam = user.team
    , nextTeam = user.nextTeam
    , respawns = this._currentMapData.respawns;

  // если команда уже была выбрана
  if (team === nextTeam) {
    if (team !== this._spectatorTeam) {
      this._chat.pushSystem('s:5:' + team, gameID);
    } else {
      this._chat.pushSystem('s:6', gameID);
    }

  // иначе если команда является текущей и не изменится в следующем раунде
  } else if (team === currentTeam && nextTeam === null) {
    if (team !== this._spectatorTeam) {
      this._chat.pushSystem('s:3:' + team, gameID);
    } else {
      this._chat.pushSystem('s:4', gameID);
    }

  // иначе смена команды
  } else {
    currentTeam  = nextTeam !== null ? nextTeam : currentTeam;

    if (team !== this._spectatorTeam) {
      // если количество респаунов на карте в выбраной команде
      // равно количеству игроков в этой команде (смена невозможна)
      if (respawns[team].length === this._allUsersInTeam[team]) {
        if (currentTeam !== this._spectatorTeam) {
          this._chat.pushSystem('s:0:' + team + ',' + currentTeam, gameID);
        } else {
          this._chat.pushSystem('s:1:' + team, gameID);
        }

        return;

      } else {
        this._chat.pushSystem('s:5:' + team, gameID);
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
};

// проверяет команду на свободные респауны и возвращает сообщение
VIMP.prototype.checkTeam = function (team) {
  var respawns = this._currentMapData.respawns
    , emptyTeam
    , message;

  // ищет команды имеющие свободные респауны
  function searchEmptyTeam() {
    var p;

    for (p in respawns) {
      if (respawns.hasOwnProperty(p)) {
        if (respawns[p].length !== this._allUsersInTeam[p]) {
          return p;
        }
      }
    }
  }

  // если команда наблюдателя
  if (team !== this._spectatorTeam) {
    // если количество респаунов на карте в выбраной команде
    // равно количеству игроков в этой команде
    if (respawns[team].length === this._allUsersInTeam[team]) {
      emptyTeam = searchEmptyTeam.call(this);

      // если найдена команда с свободным местом
      if (emptyTeam) {
        message = 's:0:' + team + ',' + emptyTeam;
        team = emptyTeam;
      } else {
        message = 's:2';
        team = this._spectatorTeam;
      }

    } else {
      message = 's:3:' + team;
    }

  } else {
    message = 's:4';
  }

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }

  return {team: team, message: message};
};

// удаляет из списка наблюдаемых игроков
VIMP.prototype.removeFromLookIDList = function (gameID) {
  var i = 0
    , len = this._playersList.length;

  for (; i < len; i += 1) {
    if (this._playersList[i] === gameID) {
      this._playersList.splice(i, 1);
    }
  }
};

// меняет или назначает ID наблюдаемого игрока
VIMP.prototype.changeLookID = function (gameID, back) {
  var currentID = this._users[gameID].lookID
    , key = this._playersList.indexOf(currentID)
    , lookID;

  // если есть наблюдаемый игрок
  if (key !== -1) {

    // если поиск назад
    if (back) {
      key -= 1;
    } else {
      key += 1;
    }

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
};

// создает нового игрока
VIMP.prototype.createUser = function (params, socket, cb) {
  var name = params.name
    , team = params.team
    , model = params.model
    , data = []
    , teamData
    , gameID
    , teamID
    , user
  ;

  data[0] = {};     // game
  data[1] = 0;      // coords
  data[2] = 0;      // panel
  data[3] = 0;      // stat
  data[4] = 0;      // chat
  data[5] = 0;      // vote

  // подбирает gameID
  function getGameID() {
    var gameID = 1;

    while (this._users[gameID]) {
      gameID += 1;
    }

    return gameID;
  }

  name = this.checkName(name);
  gameID = getGameID.call(this);
  teamData = this.checkTeam(team);

  team = teamData.team;
  message = teamData.message;

  teamID = this._teams[team];

  user = this._users[gameID] = {};

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
  this._stat.addUser(gameID, teamID, {name: name});
  this._panel.addUser(gameID);

  this.changeLookID(gameID);

  data[1] = [0, 0];
  data[2] = [this._time];
  data[3] = this._stat.getFull();
  data[4] = message;

  user.socket.send(this._portShot, data);

  process.nextTick((function () {
    cb(gameID);
    this.sendMap(gameID);
  }).bind(this));
};

// удаляет игрока
VIMP.prototype.removeUser = function (gameID, cb) {
  var bool = false
    , user = this._users[gameID]
    , team
    , nextTeam;

  // если gameID === undefined,
  // значит пользователь вышел, не успев войти в игру
  if (user) {
    team = user.team;
    nextTeam = user.nextTeam;

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
        gameID: gameID,
        model: user.model
      });

      delete this._users[gameID];
    }

    this._chat.removeUser(gameID);
    this._vote.removeUser(gameID);

    bool = true;
  }

  process.nextTick(function () {
    cb(bool);
  });
};

// обновляет команды
VIMP.prototype.updateKeys = function (gameID, keys) {
  var user = this._users[gameID];

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
};

// добавляет сообщение
VIMP.prototype.pushMessage = function (gameID, message) {
  var user = this._users[gameID];

  message = message.replace(this._expressions.message, '');

  if (message) {
    if (message.charAt(0) === '/') {
      this.parseCommand(gameID, message);
    } else {
      this._chat.push(message, user.name, user.teamID);
    }
  }
};

// обрабатывает vote-данные пользователя
VIMP.prototype.parseVote = function (gameID, data) {
  var type
    , value
    , p
    , dataArr = [];

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
      for (p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          dataArr.push(this._users[p].name + ':' + p);
        }
      }

      this._vote.pushByUser(gameID, [null, dataArr]);
    }

  // если данные 'объект' (результат голосования)
  } else if (typeof data === 'object') {
    type = data[0];
    value = data[1];

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

    // иначе если пользователь предложил забанить игрока
    } else if (type === 'ban') {
      this._chat.pushSystem(
        'v:6:' + value[1] + ',' + this._users[value[0]].name, gameID
      );
    }
  }
};

// отправляет голосование за новую карту
VIMP.prototype.changeMap = function (gameID, map) {
  var p
    , arr
    , id
    , userList = [];

  // возвращает список карт для голосования
  function getMapList() {
    var maps
      , endNumber;

    if (this._mapList.length <= this._mapsInVote) {
      return this._mapList;
    }

    endNumber = this._startMapNumber + this._mapsInVote;
    maps = this._mapList.slice(this._startMapNumber, endNumber);

    if (maps.length < this._mapsInVote) {
      endNumber = this._mapsInVote - maps.length;
      maps = maps.concat(this._mapList.slice(0, endNumber));
    }

    this._startMapNumber = endNumber;

    return maps;
  }

  // если смена карты возможна
  if (this._blockedRemap === false) {
    this._blockedRemap = true;

    // если есть gameID и карта (голосование создает пользователь)
    if (typeof gameID !== 'undefined' && typeof map === 'string') {

      arr = [
        this._users[gameID].name + ' предложил карту: ' + map,
        ['Сменить:' + map, 'Не менять:'],
        null
      ];

      for (p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          id = this._users[p].gameID;

          if (id !== gameID) {
            userList.push(id);
          }
        }
      }

      this._vote.createVote('changeMap', arr, userList);
      this._vote.addInVote('changeMap', map); // голос за пользователя
      this._chat.pushSystem('v:2', gameID);

    // иначе голосование создает игра
    } else {
      arr = [
        'Выберете следующую карту',
        getMapList.call(this),
        null
      ];

      this._vote.createVote('changeMap', arr);
    }

    // собирает результаты голосования и стартует новую игру
    setTimeout((function () {
      var map = this._vote.getResult('changeMap');

      // если есть результат и карта существует
      if (map && this._maps[map]) {
        this._chat.pushSystem('v:4:' + map);

        setTimeout((function () {
          this._currentMap = map;
          this.initMap();
        }.bind(this)), 2000);
      } else {
        this._chat.pushSystem('v:5');
      }

      // снимает блокировку смены карты
      setTimeout((function () {
        this._blockedRemap = false;
      }).bind(this), this._timeBlockedRemap);
    }).bind(this), this._voteTime);

  } else {
    if (typeof gameID !== 'undefined') {
      this._chat.pushSystem('v:3', gameID);
    }
  }
};

// обрабатывает команду от пользователя
VIMP.prototype.parseCommand = function (gameID, message) {
  var arr
    , cmd
    , value;

  message = message.replace(/\s\s+/g, ' ');
  arr = message.split(' ');
  cmd = arr.shift();
  value = arr.join(' ');

  switch (cmd) {
    // приглашение друга
    case '/invite':
      if (this._expressions.email.test(value)) {
        this._email.invite(value, (function (err) {
          if (err) {
            this._chat.pushSystem('i:2', gameID);
          } else {
            this._chat.pushSystem('i:1', gameID);
          }
        }).bind(this));
      } else {
        this._chat.pushSystem('i:0', gameID);
      }

      break;
    // смена ника
    // TODO сохранять в localstorage
    case '/name':
      this.changeName(gameID, value);
      break;
    // смена модели
    case '/model':
      this._game.changeModel(gameID, value);
      break;
    // смена пуль
    case '/bullet':
      this._game.setUserBullet(gameID, value);
      break;
    // новый раунд
    case '/nr':
      this.stopRoundTimer();
      this.startRoundTimer();
      break;
    // время карты
    case '/timeleft':
      this._chat.pushSystem(['2:00'], gameID);
      break;
    // название текущей карты
    case '/mapname':
      this._chat.pushSystem([this._currentMap], gameID);
      break;
    default:
      this._chat.pushSystem(['Command not found'], gameID);
  }
};

module.exports = VIMP;
