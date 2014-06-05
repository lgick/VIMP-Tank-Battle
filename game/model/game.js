var User = require('./User');

function getInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Singleton
var game;

function Game(data, ports) {
  if (game) {
    return game;
  }

  game = this;

  this._maps = data.maps;
  this._mapList = data.mapList;
  this._currentMapName = data.mapList[0];

  this._portConfig = ports.config;
  this._portAuth = ports.auth;
  this._portAuthErr = ports.authErr;
  this._portMap = ports.map;
  this._portShot = ports.shot;
  this._portStat = ports.stat;
  this._portChat = ports.chat;
  this._portVote = ports.vote;
  this._portInform = ports.inform;
  this._portClear = ports.clear;
  this._portLog = ports.log;

  this._shotTime = data.shotTime;
  this._roundTime = data.roundTime;
  this._mapTime = data.mapTime;
  this._voteMapTime = data.voteMapTime;

  this._teams = data.teams;

  this._voteMapArray

  this._users = {};
  this._players = [];
  this._respawns = {};

  this.init();
}

// стартует игру
Game.prototype.startGame = function (name) {
  name = name || this._mapList[0];

  this.loadMap(name);

  var roundTimer = setInterval((function () {
    //this.createNextRound();
  }).bind(this), this._roundTime);

  var shotTimer = setInterval((function () {
    this.createShot();
  }).bind(this), this._shotTime);

  setTimeout((function () {
    clearInterval(shotTimer);
    clearInterval(roundTimer);

    this.sendVoteMap(function () {
      this.startGame(name);
    });
  }).bind(this), this._mapTime);
};

// отправляет голосование за новую карту
Game.prototype.sendVoteMap = function (cb) {
  //this.send(this._portMap, )
  setTimeout((function () {
    cb('complete');
  }).bind(this), this._voteMapTime);
};

// инициализация игры
Game.prototype.init = function () {
  this.loadMap(this._mapList[getInt(0, 1)]);

  setInterval((function () {
    this.createShot();
  }).bind(this), this._shotTime);
};

// создает кадр игры
Game.prototype.createShot = function () {
  var data = {}
    , p;

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p] === null) {
        data[p] = null;
        delete this._users[p];
      } else if (this._users[p].ready) {
        if (this._users[p].team !== 'spectators') {
          this._users[p].update();
          data[p] = this._users[p].game;
        }
      }
    }
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p].ready) {
        this._users[p].socket.send(4, [
          [
            [[1, 2], data, 1]
          ],
          [this._users[p].game[0], this._users[p].game[1]]
        ]);
      }
    }
  }
};

// устанавливает карту
Game.prototype.loadMap = function (name) {
  var p;

  // если есть имя карты
  if (name) {
    this._currentMapName = name;
  }

  var map = this._maps[this._currentMapName];

  this._respawns = map.respawns;

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      this._users[p].socket.send(6);
      this.getCurrentMap(p);
    }
  }
};

// возвращает текущую карту
Game.prototype.getCurrentMap = function (gameID) {
  var map = this._maps[this._currentMapName];

  this._users[gameID].ready = false;

  this._users[gameID].socket.send(3, {
    map: map.map,
    step: map.step,
    spriteSheet: map.spriteSheet,
    options: map.options
  });
};

// сообщает о загрузке карты
Game.prototype.mapReady = function (err, gameID) {
  if (!err) {
    this._users[gameID].ready = true;
  }
};

// стартует раунд
Game.prototype.startRound = function () {
  var p
    , data
    , c = {};

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p]) {
        c[this._users[p].team] = c[this._users[p].team] || 0;
        data = this._respawns[this._users[p].team];

        if (data) {
          data = data[c[this._users[p].team]];
          this._users[p].game[0] = data[0];
          this._users[p].game[1] = data[1];
          this._users[p].game[2] = data[2];

          c[this._users[p].team] += 1;
        }
      }
    }
  }
};

// заканчивает раунд
Game.prototype.stopRound = function () {
};

// создает нового игрока
Game.prototype.createUser = function (data, socket, cb) {
  var name
    , team = data.team
    , gameID;

  // проверяет имя
  function checkName(name, number) {
    number = number || 1;

    var p;

    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p] && this._users[p].game[5] === name) {
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

  name = checkName.call(this, data.name);

  // подбирает gameID
  function getUserID() {
    var gameID = 0;

    while (this._users[gameID]) {
      gameID += 1;
    }

    return gameID;
  }

  gameID = getUserID.call(this);

  this._users[gameID] = new User({team: team, name: name});
  this._users[gameID].socket = socket;
  this._users[gameID].team = this._teams[team];
  this._users[gameID].ready = false;
  this._users[gameID].keys = '';
  this._users[gameID].message = [];

  this.startRound();

  process.nextTick((function () {
    cb(gameID);
    this.getCurrentMap(gameID);
  }).bind(this));
};

// удаляет игрока
Game.prototype.removeUser = function (gameID, cb) {
  var bool = false;

  if (this._users[gameID]) {
    this._users[gameID] = null;
    bool = true;
  }

  process.nextTick(function () {
    cb(bool);
  });
};

// обновляет команды
Game.prototype.updateKeys = function (gameID, keys) {
  this._users[gameID].keys = keys;
};

// добавляет сообщение
Game.prototype.addMessage = function (gameID, message) {
  this._users[gameID].message.push(message);
};

// обрабатывает vote данные
Game.prototype.parseVote = function (gameID, data) {
  var name
    , value;

  if (typeof data === 'string') {
    // TODO: данные запроса
    if (data === 'users') {
    }
  } else if (typeof data === 'object') {
    name = data[0];
    value = data[1];

    if (name === 'status') {
      console.log(value);
    } else if (name === 'remap') {
      console.log(value);
    } else if (name === 'ban') {
      console.log(value);
    }

    // TODO: данные голосования
  }
};

module.exports = Game;
