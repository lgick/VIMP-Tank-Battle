var User = require('./User');
var test = require('../../test/testB');
//var timeUpdate = 10000;
var timeUpdate = 1000 / 30;
var timeRound = 120000;
var teams = ['team1', 'team2', 'spectators'];
var maxPlayers = 8;
var respawn = [
  [
    [100, 128, 0],
    [100, 256, 0],
    [100, 384, 0],
    [100, 512, 0],
    [200, 128, 0],
    [200, 256, 0],
    [200, 384, 0],
    [200, 512, 0]
  ],
  [
    [700, 128, 180],
    [700, 256, 180],
    [700, 384, 180],
    [700, 512, 180]
    [600, 128, 180],
    [600, 256, 180],
    [600, 384, 180],
    [600, 512, 180]
  ]
];

// Singleton
var game;

function Game(data) {
  if (game) {
    return game;
  }

  game = this;
  this._users = [];
  this.init();
}

// инициализация игры
Game.prototype.init = function () {
  setInterval((function () {
    var i
      , len
      , g;

    var data = [];

    for (i = 0, len = this._users.length; i < len; i += 1) {
      if (this._users[i]) {
        if (this._users[i].ready === true) {
          g = this._users[i].data();

          data[i] = g[0];
          this._users[i].crds = g[1];
        }
      } else {
        if (this._users[i] === null) {
          this._users[i] = 'clear';
          data[i] = null;
        }
      }
    }

    for (i = 0, len = this._users.length; i < len; i += 1) {
      if (this._users[i] && this._users[i].ready === true) {
        this._users[i].socket.emit('shot', [
        [
          [[1, 2], data, 1]
        ],
        this._users[i].crds
        ]);
      }
    }

  }).bind(this), timeUpdate);
};

// стартует раунд
Game.prototype.startRound = function () {
};

// заканчивает раунд
Game.prototype.stopRound = function () {
};

// создает нового игрока
Game.prototype.createUser = function (data, socket, cb) {
  var i = 0
    , len = this._users.length
    , userID;

  for (; i < len; i += 1) {
    if (this._users[i] === null) {
      userID = i;
      return;
    }
  }

  if (!userID) {
    userID = this._users.length;
  }

  var user = test.gameC();
  //var user = new User(data);

  this._users[userID] = {
    ready: false,
    data: user,
    socket: socket
  };

  process.nextTick(function () {
    cb(userID);
  });
};

// активизирует игрока
Game.prototype.ready = function (userID, bool) {
  this._users[userID].ready = bool;
};

// удаляет игрока
Game.prototype.removeUser = function (userID) {
  this._users[userID] = null;
};

// обновляет игроков
Game.prototype.updateUsers = function () {
};

// обновляет команды
Game.prototype.updateKeys = function (userID, keys) {
  this._users[userID].keys = keys;
};

module.exports = Game;
