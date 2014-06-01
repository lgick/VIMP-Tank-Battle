var User = require('./User');

// Singleton
var game;

function Game(data) {
  if (game) {
    return game;
  }

  game = this;

  this._maps = data.maps;
  this._mapList = data.mapList;
  this._currentMapName = data.mapList[0];

  this._timeShot = data.timeShot;
  this._timeRound = data.timeRound;
  this._timeMap = data.timeMap;
  this._teams = data.teams;

  this._users = {};
  this._players = [];
  this._respawns = {};

  this.init();
}

// инициализация игры
Game.prototype.init = function () {
  this.loadMap();

  //setInterval((function () {
  //  //this.voteMap();
  //  //this.loadMap(this._mapList[1]);
  //}).bind(this), this._timeMap);

  //setInterval((function () {
  //  //this.createNextRound();
  //}).bind(this), this._timeRound);

  setInterval((function () {
    this.createShot();
  }).bind(this), this._timeShot);
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
  if (typeof data === 'string') {
    // TODO: данные запроса
    if (data === 'users') {
    }
  } else if (typeof data === 'object') {
    // TODO: данные голосования
  }
};

module.exports = Game;
