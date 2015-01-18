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

  this._teams = data.teams;                 // команды
  this._spectatorID = data.spectatorID;     // id наблюдателя

  this._portConfig = ports.config;
  this._portAuth = ports.auth;
  this._portAuthErr = ports.authErr;
  this._portMap = ports.map;
  this._portShot = ports.shot;
  this._portInform = ports.inform;
  this._portClear = ports.clear;
  this._portLog = ports.log;

  this._users = {};                         // игроки
  this._currentMapData = null;              // данные текущей карты

  this._stepTimer = null;
  this._roundTimer = null;
  this._shotTimer = null;
  this._mapTimer = null;

  this._time = this._roundTime;             // время игры
  this._timeStatus = false;                 // флаг обновления времени игры

  this._allUsersInTeam = {};                // количество игроков в команде

  // итеративный таймер
  // с каждым тиком увеличивается текущее время
  // и проверяется если ли данные (например пуль) для этого времени
  this._currentTime = 0;
  this._minTime = 1;
  this._maxTime = 100;

  this._bulletTime = 20;                    // время жизни пули
  this._bullets = {};                       // this._bullets[time] = [id, id]
  this._currentBulletID = 0;                // id для пуль

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
  var p;

  this._currentMapData = this._maps[this.vote.getCurrentMap()];
  this.stopGame();
  this._allUsersInTeam = {};

  // корректирование статуса игроков под новые респауны и смена карты
  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p] !== null) {
        this.changeTeam({gameID: p, team: this._users[p].team});
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
    this._users[gameID].ready = false;
    this._users[gameID].socket.send(this._portMap, this._currentMapData);
  } else {
    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p] !== null) {
          this._users[p].socket.send(this._portInform, [3]);
          this._users[p].ready = false;
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
    this._users[gameID].ready = true;
  }
};

// отправляет первый shot (каждый раунд)
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
      } else if (this._users[p].ready) {

        // если удалить модель с полотна
        if (this._users[p].removeGameModel === true) {
          gameData[p] = null;
          this._users[p].removeGameModel = false;
        }

        // если teamID не id наблюдателя
        if (this._users[p].teamID !== this._spectatorID) {
          this._users[p].updateData();

          gameData[p] = [
            this._users[p].data[0],
            this._users[p].data[1],
            this._users[p].data[2],
            this._users[p].data[3]
          ];

          if (this._users[p].userChanged === true) {
            // TODO убирать флаг:
            //this._users[p].userChanged = false;
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
        }
      }
    }
  }

  game = [[[1, 2], gameData], [[3], bulletData]];
  stat = this.stat.getLastStat();
  chat = this.chat.shift();
  vote = this.vote.shift();

  time = this._timeStatus === true ? this._time : '';
  this._timeStatus = false;

  function getUserData(gameID) {
    var user = this._users[gameID]
      , coords
      , panel
      , chatUser
      , voteUser
    ;

    // coords
    coords = [user.data[0], user.data[1]];

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

    return [game, coords, panel, stat, chatUser, voteUser];
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p].ready) {
        // отправка данных
        this._users[p].socket.send(
          this._portShot, getUserData.call(this, p)
        );
      }
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

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];

      // если пользователь существует
      if (user !== null) {
        this.sendFirstShot(p);

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
  var team = data.team
    , gameID = data.gameID
    , oldTeam = data.oldTeam
    , respawns = this._currentMapData.respawns
    , emptyTeam
  ;

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

  if (team !== 'spectators') {
    // если количество респаунов на карте в выбраной команде
    // равно количеству игроков в этой команде
    if (respawns[team].length === this._allUsersInTeam[team]) {
      // если есть старый статус (смена команды пользователем)
      if (oldTeam) {
        this.chat.pushSystem('s:0:' + team + ',' + oldTeam, gameID);
        return;

      // иначе поиск статуса
      } else {
        emptyTeam = searchEmptyTeam.call(this);

        // если найдена команда с свободным местом
        if (emptyTeam) {
          this.chat.pushSystem('s:0:' + team + ',' + emptyTeam, gameID);
          team = emptyTeam;
        } else {
          this.chat.pushSystem('s:1', gameID);
          team = 'spectators';
        }
      }

    } else {
      // если смена команды пользователем
      if (oldTeam) {
        this.chat.pushSystem('s:4:' + team, gameID);
      } else {
        this.chat.pushSystem('s:2:' + team, gameID);
      }
    }

  } else {
    this.chat.pushSystem('s:3', gameID);
  }

  this._users[gameID].team = team;

  // если есть старый статус
  if (oldTeam) {
    this._allUsersInTeam[oldTeam] -= 1;
  }

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }
};

// создает нового игрока
Game.prototype.createUser = function (data, socket, cb) {
  var name = data.name
    , team = data.team
    , gameID;

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

  this._users[gameID] = new User();

  this._users[gameID].socket = socket;
  this._users[gameID].ready = false;

  this.chat.addUser(gameID);
  this.vote.addUser(gameID);

  this._users[gameID].name = name;
  this.changeTeam({gameID: gameID, team: team});

  this.sendFirstShot(gameID);
  // до нового раунда статус наблюдателя
  this._users[gameID].teamID = this._spectatorID;

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

    // если игрок был в spectators, то удалить
    if (this._users[gameID].team === 'spectators') {
      delete this._users[gameID];
    // иначе сделать null, чтобы удалить экземпляр на клиенте
    } else {
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
  this._users[gameID].updateKeys(keys);
};

// добавляет сообщение
Game.prototype.pushMessage = function (arr) {
  this.chat.pushSystem(arr[0], arr[1]);
};

module.exports = Game;
