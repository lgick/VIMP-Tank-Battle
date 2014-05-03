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
  this._data = {};
  this.init();
}

// инициализация игры
Game.prototype.init = function () {
  setInterval((function () {
    var i = 0
      , len = this._users.length
      , g;

    for (; i < len; i += 1) {
      if (this._users[i] !== null && this._users[i].ready === true) {

        g = this._users[i].data();

        this._data['bot#' + i] = g[0];
        this._users[i].crds = g[1];

        //this._users[i].socket.emit('shot', getShot(this._users[i].data));
      }
    }

    for (i = 0, len = this._users.length; i < len; i += 1) {
      if (this._users[i] !== null && this._users[i].ready === true) {
        //this._users[i].socket.emit('shot', [this._data, this._users[i].crds]);
        this._users[i].socket.emit('shot', [
        [
          [
            ['Tank', 'Radar'],
            this._data,
            true
          ]
        ],
        this._users[i].crds
        ]);
      }
    }

    this._data = {};

  }).bind(this), timeUpdate);
};

// стартует раунд
Game.prototype.startRound = function () {
};

// заканчивает раунд
Game.prototype.stopRound = function () {
};

// создает нового игрока
Game.prototype.createUser = function (data, socketID, socket) {
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
    socketID: socketID,
    socket: socket
  };

  return userID;
};

// активизирует игрока
Game.prototype.ready = function (userID, bool) {
  console.log(this._users);
  this._users[userID].ready = bool;
};

// удаляет игрока
Game.prototype.removeUser = function (userID) {
  console.log('remove +++++++++++++++++++++');
  console.log(this._users);
  this._users[userID] = null;
  console.log(this._users);
  console.log('remove +++++++++++++++++++++');
};

// обновляет игроков
Game.prototype.updateUsers = function () {
};

// создает пулю
Game.prototype.createBullet = function (socketID) {
};

module.exports = Game;
