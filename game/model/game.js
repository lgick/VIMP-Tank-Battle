var User = require('./User');
var log = require('../../lib/log')(module);
var test = require('../../test/testB');

// Singleton
var game;

function Game(data) {
  if (game) {
    return game;
  }

  game = this;

  this._users = {};

  this._timeUpdate = 1000;
  this._timeRound = 120000;
  this._teams = ['team1', 'team2', 'spectators'];
  this._respawnList = {
    team1: [
      [100, 128, 0],
      [100, 256, 0],
      [100, 384, 0],
      [100, 512, 0],
      [200, 128, 0],
      [200, 256, 0],
      [200, 384, 0],
      [200, 512, 0]
    ],
    team2: [
      [700, 128, 180],
      [700, 256, 180],
      [700, 384, 180],
      [700, 512, 180]
      [600, 128, 180],
      [600, 256, 180],
      [600, 384, 180],
      [600, 512, 180]
    ]
  };

  this.init();
}

// инициализация игры
Game.prototype.init = function () {
  setInterval((function () {
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
          this._users[p].socket.emit('shot', [
            [
              [[1, 2], data, 1]
            ],
            [this._users[p].game[0], this._users[p].game[1]]
          ]);
        }
      }
    }
  }).bind(this), this._timeUpdate);
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
        data = this._respawnList[this._users[p].team];

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

// возвращает игрока по socket.id
Game.prototype.getUser = function (userID) {
  return this._users[userID];
};

// возвращает количество игроков
Game.prototype.getLength = function () {
  var i = 0;

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      i += 1;
    }
  }

  return i;
};

// создает нового игрока
Game.prototype.createUser = function (data, socket, cb) {
  var name
    , team = data.team
    , userID;

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

  // подбирает userID
  function getUserID() {
    var userID = 0;

    while (this._users[userID]) {
      userID += 1;
    }

    return userID;
  }

  userID = getUserID.call(this);

  this._users[userID] = new User({team: team, name: name});
  this._users[userID].socket = socket;
  this._users[userID].team = this._teams[team];
  this._users[userID].ready = true;

  this.startRound();

  process.nextTick(function () {
    cb(userID);
  });
};

// активизирует игрока
Game.prototype.ready = function (userID, bool) {
  this._users[userID].ready = bool;
};

// удаляет игрока
Game.prototype.removeUser = function (userID, cb) {
  var bool = false;

  if (this._users[userID]) {
    this._users[userID] = null;
    bool = true;
  }

  process.nextTick(function () {
    cb(bool);
  });
};

// обновляет игроков
Game.prototype.updateUsers = function () {
};

// обновляет команды
Game.prototype.updateKeys = function (userID, keys) {
  this._users[userID].keys = keys;
};

module.exports = Game;
