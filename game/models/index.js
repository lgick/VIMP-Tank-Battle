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

  this._maps = data.map.maps;               // карты

  this._mapTime = data.time.mapTime;        // продолжительность карты
  this._shotTime = data.time.shotTime;      // время обновления кадра игры
  this._roundTime = data.time.roundTime;    // продолжительность раунда

  // команды
  this._teams = data.teams;
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

  this._time = this._roundTime;  // время игры
  this._timeStatus = false;      // флаг обновления времени игры

  this._allUsersInTeam = {};     // количество игроков в команде
  this._playersList = [];        // список играющих (у кого lookOnly === false)

  // итеративный таймер
  // с каждым тиком увеличивается текущее время
  // и проверяется если ли данные (например пуль) для этого времени
  this._currentTime = 0;
  this._minTime = 1;
  this._maxTime = 100;

  this._bulletTime = 20;         // время жизни пули
  this._bullets = {};            // this._bullets[time] = [id, id]
  this._currentBulletID = 0;     // id для пуль

  this.panel = new Panel();
  this.stat = new Stat(this._users, this._teams);
  this.chat = new Chat(this._users);
  this.vote = new Vote(this._users, data);

  this._pubVote = this.vote.publisher;
  this._pubVote.on('map', 'initMap', this);
  this._pubVote.on('chat', 'pushMessage', this);
  this._pubVote.on('team', 'changeTeam', this);

  this.initMap();
}

// стартует игру
Game.prototype.startGame = function () {
  this.stat.init();
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
    this.vote.changeMap();
  }).bind(this), this._mapTime);
};

// останавливает карту
Game.prototype.stopMapTimer = function () {
  console.log('map timer stop');
  clearTimeout(this._mapTimer);
};

// стартует раунд
Game.prototype.startRoundTimer = function () {
  this.startRound();
  this.panel.init();

  this._time = this._roundTime / 1000 - 3;
  this._timeStatus = true;

  this._stepTimer = setInterval((function () {
    if (this._time > 0) {
      this._time -= 1;
      this._timeStatus = true;
    }
  }).bind(this), 1000);

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
Game.prototype.initMap = function () {
  var p
    , user
    , teamData;

  this._currentMapData = this._maps[this.vote.getCurrentMap()];
  this.stopGame();
  this._allUsersInTeam = {};

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

  this.changeMap();
  this.startGame();
};

// меняет карту
Game.prototype.changeMap = function (gameID) {
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
  var data = []
    , gameData = {}
    , oldTeamID
    , teamID
    , p;

  data[0] = 0;      // game
  data[1] = 0;      // coords
  data[2] = 0;      // panel
  data[3] = 0;      // stat
  data[4] = 0;      // chat
  data[5] = 0;      // vote

  oldTeamID = this._users[gameID].teamID;
  teamID = this._teams[this._users[gameID].team];

  // если назначенный teamID не совпадает с новым
  if (oldTeamID !== teamID) {
    this._users[gameID].userChanged = true;

    // если oldTeamID был назначен
    // (пользователь сменил команду)
    if (typeof oldTeamID !== 'undefined') {
      this.stat.removeUser(gameID);

      // если новый teamID - id наблюдателя,
      // то удалить модель игрока
      // и очистить панель
      if (teamID === this._spectatorID) {
        this._users[gameID].removeGameModel = true;

        data[2] = [this._time, null];
        this.panel.removeUser(gameID);
      }
    }

    this._users[gameID].teamID = teamID;
    this.stat.addUser(gameID);

    // если oldTeamID не был назначен
    // (новый пользователь)
    if (typeof oldTeamID === 'undefined') {
      data[3] = this.stat.getStat();
    }

    if (teamID !== this._spectatorID) {
      this.panel.addUser(gameID);
    }
  }

  if (teamID !== this._spectatorID) {
    this._users[gameID].lookOnly = false;
    this._users[gameID].keySet = 1;
    this._playersList.push(gameID);
  } else {
    this._users[gameID].lookOnly = true;
    this._users[gameID].keySet = 0;
  }

  this._users[gameID].socket.send(this._portShot, data);
};

// создает кадр игры
Game.prototype.createShot = function () {
  var game = 0
    , stat = 0
    , chat = 0
    , vote = 0
    , time
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

        // если teamID не id наблюдателя
        // TODO убрал проверку на teamID !== this._spectatorID
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
  stat = this.stat.getLastStat();
  chat = this.chat.shift();
  vote = this.vote.shift();

  time = this._timeStatus === true ? this._time : '';
  this._timeStatus = false;

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

    // panel
    panel = this.panel.getPanel(gameID) || '';

    if (typeof time === 'number' || panel) {
      panel = [time, panel];
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
Game.prototype.changeTeam = function (data) {
// TODO проверять переход в другую команду с учетом следующего раунда
// и вновь зашедших игроков
  var team = data.team
    , gameID = data.gameID
    , oldTeam = data.oldTeam
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

  this._users[gameID].team = team;
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
  this._users[gameID].teamID = this._teams[team];
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
  this.stat.addUser(gameID);

  if (team !== this._spectatorTeam) {
    this.panel.addUser(gameID);
  }

  this.changeLookID(gameID);

  // TODO сделать дефолтные данные в индексе из юзера
  data[1] = [0, 0]; // TODO получить дефолтные данные наблюдателя
  data[2] = [this._time, null];
  data[3] = this.stat.getStat();
  data[4] = message;

  this._users[gameID].socket.send(this._portShot, data);

  process.nextTick((function () {
    cb(gameID);
    this.changeMap(gameID);
  }).bind(this));
};

// удаляет игрока
Game.prototype.removeUser = function (gameID, cb) {
  var bool = false;

  // если gameID === undefined,
  // значит пользователь вышел, не успев войти в игру
  if (this._users[gameID]) {
    this.stat.removeUser(gameID);

    this._allUsersInTeam[this._users[gameID].team] -= 1;

    // если игрок - наблюдатель, то удалить
    if (this._users[gameID].team === this._spectatorTeam) {
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
Game.prototype.pushMessage = function (arr) {
  this.chat.pushSystem(arr[0], arr[1]);
};

module.exports = Game;
