var User = require('./user');
var Panel = require('./panel');
var Stat = require('./stat');
var Chat = require('./chat');
var Vote = require('./vote');

// Singleton
var game;

function Game(data, ports) {
  if (game) {
    return game;
  }

  game = this;

  this._maps = data.maps;                   // карты
  this._mapList = Object.keys(this._maps);  // список карт массивом
  this._mapsInVote = data.mapsInVote;       // карт в голосовании

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

  this._blockedRemap = false;    // флаг блокировки голосования за новую карту
  this._startMapNumber = 0;      // номер первой карты в голосовании

  // итеративный таймер
  // с каждым тиком увеличивается текущее время
  // и проверяется если ли данные (например пуль) для этого времени
  this._currentTime = 0;
  this._minTime = 1;
  this._maxTime = 100;

  this._bulletTime = 20;         // время жизни пули
  this._bullets = {};            // this._bullets[time] = [id, id]
  this._currentBulletID = 0;     // id для пуль

  this.panel = new Panel(data.panel);
  this.stat = new Stat(data.stat, this._teams);
  this.chat = new Chat();
  this.vote = new Vote();

  this.initMap(data.currentMap);
}

// стартует игру
Game.prototype.startGame = function () {
  this.startMapTimer();
  this.startShotTimer();
  this.startRoundTimer();
};

// останавливает игру
Game.prototype.stopGame = function () {
  console.log('stop all timers');
  clearInterval(this._stepTimer);
  clearInterval(this._shotTimer);
  clearTimeout(this._roundTimer);
  clearTimeout(this._mapTimer);
};

// стартует карту
Game.prototype.startMapTimer = function () {
  this.chat.pushSystem('t:0');

  this._mapTimer = setTimeout((function () {
    this.sendMap();
  }).bind(this), this._mapTime);
};

// останавливает карту
Game.prototype.stopMapTimer = function () {
  console.log('map timer stop');
  clearTimeout(this._mapTimer);
};

// стартует раунд
Game.prototype.startRoundTimer = function () {
  this._time = this._roundTime / 1000 - 3;

  this._stepTimer = setInterval((function () {
    if (this._time > 0) {
      this._time -= 1;
    }
  }).bind(this), 1000);

  this.startRound();
  this.panel.reset();

  this._roundTimer = setTimeout((function () {
    clearInterval(this._stepTimer);

    this._currentBulletID = 0;
    this.startRoundTimer();
    this.chat.pushSystem('t:1');
  }).bind(this), this._roundTime);
};

// останавливает раунд
Game.prototype.stopRoundTimer = function () {
  console.log('round timer stop');
  clearTimeout(this._roundTimer);
};

// стартует расчет кадров игры
Game.prototype.startShotTimer = function () {
  this._shotTimer = setInterval((function () {
    this.createShot();
  }).bind(this), this._shotTime);
};

// останавливает расчет кадров игры
Game.prototype.stopShotTimer = function () {
  console.log('shot timer stop');
  clearInterval(this._shotTimer);
};

// инициализирует карту
Game.prototype.initMap = function (map) {
  var p
    , user
    , teamData;

  this._currentMapData = this._maps[map];
  this.stopGame();
  this._allUsersInTeam = {};
  this.stat.reset();

  // корректирование статуса игроков под новые респауны и смена карты
  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];

      if (user !== null) {
        teamData = this.checkTeam(user.team);
        user.team = teamData.team;
        this.chat.pushSystem(teamData.message, user.gameID);
      }
    }
  }

  this.sendMap();
  this.startGame();
};

// отправляет карту
Game.prototype.sendMap = function (gameID) {
  var p;

  if (gameID) {
    this._users[gameID].socket.send(this._portInform, [3]);
    this._users[gameID].mapReady = false;
    this._users[gameID].socket.send(this._portMap, this._currentMapData);
  } else {
    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p] !== null) {
          this._users[p].socket.send(this._portInform, [3]);
          this._users[p].mapReady = false;
          this._users[p].socket.send(this._portMap, this._currentMapData);
        }
      }
    }
  }
};

// сообщает о загрузке карты
Game.prototype.mapReady = function (err, gameID) {
  if (!err) {
    this._users[gameID].socket.send(this._portInform);
    this._users[gameID].mapReady = true;
  }
};

// отправляет первый shot (в начале каждого раунда)
Game.prototype.sendFirstShot = function (gameID) {
  var user = this._users[gameID]
    , nextTeam = user.nextTeam
    , teamID = user.teamID
    , data = [];

  data[0] = 0;      // game
  data[1] = 0;      // coords
  data[2] = 0;      // panel
  data[3] = 0;      // stat
  data[4] = 0;      // chat
  data[5] = 0;      // vote

  // если пользователь сменил команду
  if (nextTeam !== null) {
    user.nextTeam = null;

    // перемещение пользователя в статистике
    this.stat.moveUser(gameID, teamID, this._teams[nextTeam]);

    teamID = user.teamID = this._teams[nextTeam];
    user.team = nextTeam;
    user.userChanged = true;

    if (teamID === this._spectatorID) {
      user.removeGameModel = true;
    }
  }

  if (teamID !== this._spectatorID) {
    user.lookOnly = false;
    user.keySet = 1;
    this._playersList.push(gameID);
    this.stat.updateUser(gameID, teamID, {status: ''});
    data[2] = [this._time];
  } else {
    user.lookOnly = true;
    user.keySet = 0;
    data[2] = [this._time].concat(this.panel.getEmpty());
  }

  user.socket.send(this._portShot, data);
};

// создает кадр игры
Game.prototype.createShot = function () {
  var game = 0
    , stat = 0
    , chat = 0
    , vote = 0
    , gameData = {}
    , bulletData = {}
    , p
    , bulletTime
    , bullet
    , oldBullets
    , bulletID
    , i
    , len
  ;

  this._currentTime += 1;

  if (this._currentTime > this._maxTime) {
    this._currentTime = this._minTime;
  }

  bulletTime = this._currentTime + this._bulletTime;

  if (bulletTime > this._maxTime) {
    bulletTime = bulletTime - this._maxTime;
  }

  this._bullets[bulletTime] = [];

  oldBullets = this._bullets[this._currentTime];

  if (oldBullets && oldBullets.length) {
    for (i = 0, len = oldBullets.length; i < len; i += 1) {
      bulletData[oldBullets[i]] = null;
    }
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      // если модель пользователя была удалена
      if (this._users[p] === null) {
        gameData[p] = null;
        delete this._users[p];
      // иначе если пользователь готов
      } else if (this._users[p].mapReady) {

        // если удалить модель с полотна
        if (this._users[p].removeGameModel === true) {
          gameData[p] = null;
          this._users[p].removeGameModel = false;
        }

        // если игрок - наблюдатель
        if (this._users[p].lookOnly !== true) {
          this._users[p].updateData();

          gameData[p] = [
            this._users[p].data[0],
            this._users[p].data[1],
            this._users[p].data[2],
            this._users[p].data[3]
          ];

          if (this._users[p].userChanged === true) {
            gameData[p][4] = this._users[p].teamID;
            gameData[p][5] = this._users[p].name;
          }

          bullet = this._users[p].bullet;

          if (bullet) {
            bulletID = this._currentBulletID.toString(36);
            bulletData[bulletID] = bullet;
            this._bullets[bulletTime].push(bulletID);
            this._currentBulletID += 1;
            this._users[p].bullet = null;
          }

        // иначе режим наблюдателя
        } else {
        }
      }
    }
  }

  // TODO сделать динамический конструктор
  game = [[[1, 2], gameData], [[3], bulletData]];
  stat = this.stat.getLast();
  chat = this.chat.shift();
  vote = this.vote.shift();

  function getUserData(gameID) {
    var user = this._users[gameID]
      , keySet = user.keySet
      , lookUser
      , coords
      , panel
      , chatUser
      , voteUser
    ;

    // если статус наблюдателя и есть наблюдаемые
    if (user.lookOnly === true && this._playersList.length) {
      lookUser = this._users[user.lookID];

      // если наблюдаемый игрок не существует (завершил игру)
      if (!lookUser) {
        this.changeLookID(gameID);
        lookUser = this._users[user.lookID];
      }

      coords = [lookUser.data[0], lookUser.data[1]];
    } else {
      coords = [user.data[0], user.data[1]];
    }

    if (user.lookOnly === false) {
      // panel
      panel = this.panel.getPanel(gameID);

      if (panel) {
        panel = [null].concat(panel);
      } else {
        panel = 0;
      }
    } else {
      panel = 0;
    }

    // если общих сообщений нет
    if (!chat) {
      chatUser = this.chat.shiftByUser(gameID) || 0;
    } else {
      chatUser = chat;
    }

    // если общих данных для голосования нет
    if (!vote) {
      voteUser = this.vote.shiftByUser(gameID) || 0;
    } else {
      voteUser = vote;
    }

    // TODO убирать флаг:
    // сбрасывание флага изменений данных пользователя
    //user.userChanged = false;

    if (typeof keySet === 'number') {
      user.keySet = null;
      return [game, coords, panel, stat, chatUser, voteUser, keySet];
    } else {
      return [game, coords, panel, stat, chatUser, voteUser];
    }
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      // отправка данных
      this._users[p].socket.send(this._portShot, getUserData.call(this, p));
    }
  }
};

// стартует раунд
// перемещает игроков на респауны и отправляет первый shot
Game.prototype.startRound = function () {
  var respawns = this._currentMapData.respawns
    , p
    , user
    , data
    , respID = {};

  // TODO респауны при смене карты на arena_1x1 не обновляются
  // пользователи не перемещаются в свободные команды

  // очищение списка играющих
  this._playersList = [];

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];

      // если пользователь существует
      if (user !== null) {
        this.sendFirstShot(user.gameID);

        respID[user.team] = respID[user.team] || 0;
        data = respawns[user.team];

        if (data) {
          data = data[respID[user.team]];
          user.setData(data);
          respID[user.team] += 1;
        }
      }
    }
  }
};

// заканчивает раунд
Game.prototype.stopRound = function () {
};

// меняет команду игрока
Game.prototype.changeTeam = function (gameID, team) {
// TODO проверять переход в другую команду с учетом следующего раунда
// и вновь зашедших игроков
  var oldTeam = this._users[gameID].team
    , respawns = this._currentMapData.respawns
    , emptyTeam
  ;

  if (team !== this._spectatorTeam) {
    // если количество респаунов на карте в выбраной команде
    // равно количеству игроков в этой команде
    if (respawns[team].length === this._allUsersInTeam[team]) {
      this.chat.pushSystem('s:0:' + team + ',' + oldTeam, gameID);
      return;

    } else {
      this.chat.pushSystem('s:4:' + team, gameID);
    }

  } else {
    this.chat.pushSystem('s:3', gameID);
  }

  this._users[gameID].nextTeam = team;
  this._allUsersInTeam[oldTeam] -= 1;

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }
};

// проверяет команду на свободные респауны и возвращает сообщение
Game.prototype.checkTeam = function (team) {
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
        team = emptyTeam;
        message = 's:0:' + team + ',' + emptyTeam;
      } else {
        team = this._spectatorTeam;
        message = 's:1';
      }

    } else {
      message = 's:2:' + team;
    }

  } else {
    message = 's:3';
  }

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }

  return {team: team, message: message};
};

// удаляет из списка наблюдаемых игроков
Game.prototype.removeFromLookIDList = function (gameID) {
  var i = 0
    , len = this._playersList.length;

  for (; i < len; i += 1) {
    if (this._playersList[i] === gameID) {
      this._playersList.splice(i, 1);
    }
  }
};

// меняет или назначает ID наблюдаемого игрока
Game.prototype.changeLookID = function (gameID, back) {
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
    } else if (key > this._playersList.length) {
      key = 0;
    }

    lookID = this._playersList[key];

  } else {
    lookID = this._playersList[0];
  }

  this._users[gameID].lookID = lookID;
};

// создает нового игрока
Game.prototype.createUser = function (params, socket, cb) {
  var name = params.name
    , team = params.team
    , data = []
    , teamData
    , gameID
    , teamID
  ;

  data[0] = 0;      // game
  data[1] = 0;      // coords
  data[2] = 0;      // panel
  data[3] = 0;      // stat
  data[4] = 0;      // chat
  data[5] = 0;      // vote

  // проверяет имя
  function checkName(name, number) {
    number = number || 1;

    var p;

    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p] !== null && this._users[p].name === name) {
          if (number > 1) {
            name = name.slice(0, name.lastIndexOf('#')) + '#' + number;
          } else {
            name = name + '#' + number;
          }

          return checkName.call(this, name, number + 1);
        }
      }
    }

    return name;
  }

  // подбирает gameID
  function getGameID() {
    var gameID = 1;

    while (this._users[gameID]) {
      gameID += 1;
    }

    return gameID;
  }

  name = checkName.call(this, name);
  gameID = getGameID.call(this);
  teamData = this.checkTeam(team);

  team = teamData.team;
  message = teamData.message;

  teamID = this._teams[team];

  this._users[gameID] = new User();

  // ДАННЫЕ ПОЛЬЗОВАТЕЛЯ
  // сокет
  this._users[gameID].socket = socket;
  // флаг загрузки текущей карты
  this._users[gameID].mapReady = false;
  // флаг обновления данных пользователя (имя, команда)
  this._users[gameID].userChanged = true;
  // имя пользователя
  this._users[gameID].name = name;
  // название команды
  this._users[gameID].team = team;
  // название команды в следующем раунде
  this._users[gameID].nextTeam = null;
  // ID команды
  this._users[gameID].teamID = teamID;
  // gameID игрока
  this._users[gameID].gameID = gameID;
  // флаг наблюдателя игры
  this._users[gameID].lookOnly = true;
  // ID наблюдаемого игрока
  this._users[gameID].lookID = null;
  // набор клавиш
  this._users[gameID].keySet = 0;
  // набор нажатых клавиш
  this._users[gameID].keys = null;
  // координаты игрока
  this._users[gameID].data = []; // TODO исправить
  // пули игрока
  this._users[gameID].bullet = null;
  // флаг удаление игрока с полотна
  this._users[gameID].removeGameModel = false;

  this.chat.addUser(gameID);
  this.vote.addUser(gameID);
  this.stat.addUser(gameID, teamID, {name: name});
  this.panel.addUser(gameID);

  this.changeLookID(gameID);

  // TODO сделать дефолтные данные в индексе из юзера
  data[1] = [0, 0]; // TODO получить дефолтные данные наблюдателя
  data[2] = [this._time];
  data[3] = this.stat.getFull();
  data[4] = message;

  this._users[gameID].socket.send(this._portShot, data);

  process.nextTick((function () {
    cb(gameID);
    this.sendMap(gameID);
  }).bind(this));
};

// удаляет игрока
Game.prototype.removeUser = function (gameID, cb) {
  var bool = false
    , user = this._users[gameID];

  // TODO gameID брать из user???

  // если gameID === undefined,
  // значит пользователь вышел, не успев войти в игру
  if (user) {
    this.stat.removeUser(gameID, user.teamID);

    this._allUsersInTeam[user.team] -= 1;

    // если игрок - наблюдатель, то удалить
    if (user.team === this._spectatorTeam) {
      delete this._users[gameID];
    // иначе сделать null, чтобы удалить экземпляр на клиенте
    } else {
      this.removeFromLookIDList(gameID);
      this._users[gameID] = null;
      this.panel.removeUser(gameID);
    }

    this.chat.removeUser(gameID);
    this.vote.removeUser(gameID);

    bool = true;
  }

  process.nextTick(function () {
    cb(bool);
  });
};

// обновляет команды
Game.prototype.updateKeys = function (gameID, keys) {
  if (this._users[gameID].lookOnly === true) {
    // next player
    if (keys & 1 << 0) {
      this.changeLookID(gameID);

    // prev player
    } else if (keys & 1 << 1) {
      this.changeLookID(gameID, true);
    }
  } else {
    this._users[gameID].keys = keys;
  }
};

// добавляет сообщение
Game.prototype.pushMessage = function (message, gameID) {
  var user = this._users[gameID];

  this.chat.push(message, user.name, user.teamID);
};

// обрабатывает vote-данные пользователя
Game.prototype.parseVote = function (gameID, data) {
  var type
    , value
    , p
    , dataArr = [];

  // если данные 'строка' (запрос данных)
  if (typeof data === 'string') {
    // если запрос списка команд
    if (data === 'teams') {
      this.vote.pushByUser(gameID, [null, this._teamList]);

    // если запрос всех карт
    } else if (data === 'maps') {
      this.vote.pushByUser(gameID, [null, this._mapList]);

    // если запрос пользователей
    } else if (data === 'users') {
      for (p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          dataArr.push(this._users[p].name + ':' + p);
        }
      }

      this.vote.pushByUser(gameID, [null, dataArr]);
    }

  // если данные 'объект' (результат голосования)
  } else if (typeof data === 'object') {
    type = data[0];
    value = data[1];

    // если пользователь проголосовал за карту
    if (type === 'changeMap') {
      value = value[0];

      this.vote.addInVote(type, value);
      this.chat.pushSystem('v:0', gameID);

    // иначе если пользователь захотел сменить карту
    } else if (type === 'mapUser') {
      value = value[0];

      // если карта является текущей
      if (value === this._currentMapData.name) {
        this.chat.pushSystem('v:1:' + value, gameID);
      } else {
        this.changeMap(gameID, value);
      }

    // иначе если смена статуса
    } else if (type === 'team') {
      value = value[0];

      // если статус является текущим
      if (value === this._users[gameID].team) {
        this.chat.pushSystem('s:2:' + value, gameID);
      } else {
        this.changeTeam(gameID, value);
      }

    // иначе если пользователь предложил забанить игрока
    } else if (type === 'ban') {
      this.chat.pushSystem(
        'v:6:' + value[1] + ',' + this._users[value[0]].name, gameID
      );
    }
  }
};

// отправляет голосование за новую карту
Game.prototype.changeMap = function (gameID, map) {
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

      this.vote.createVote('changeMap', arr, userList);
      this.vote.addInVote('changeMap', map); // голос за пользователя
      this.chat.pushSystem('v:2', gameID);

    // иначе голосование создает игра
    } else {
      arr = [
        'Выберете следующую карту',
        getMapList.call(this),
        null
      ];

      this.vote.createVote('changeMap', arr);
    }

    // собирает результаты голосования и стартует новую игру
    setTimeout((function () {
      var map = this.vote.getResult('changeMap');

      // если есть результат и карта существует
      if (map && this._maps[map]) {
        this.chat.pushSystem('v:4:' + map);

        setTimeout((function () {
          this.initMap(map);
        }.bind(this)), 2000);
      } else {
        this.chat.pushSystem('v:5');
      }

      // снимает блокировку смены карты
      setTimeout((function () {
        this._blockedRemap = false;
      }).bind(this), this._timeBlockedRemap);
    }).bind(this), this._voteTime);

  } else {
    if (typeof gameID !== 'undefined') {
      this.chat.pushSystem('v:3', gameID);
    }
  }
};

module.exports = Game;
