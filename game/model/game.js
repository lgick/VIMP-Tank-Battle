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

  this._maps = data.maps;                   // карты
  this._mapList = data.mapList;             // массив с названием карт
  this._mapTime = data.mapTime;             // продолжительность карты
  this._currentMap = data.currentMap;       // текущая карта

  this._shotTime = data.shotTime;           // время обновления кадра игры

  this._roundTime = data.roundTime;         // продолжительность раунда

  this._voteMapTime = data.voteMapTime;     // время ожидания голосования
  this._voteMapAmount = data.voteMapAmount; // всего карт в голосовании

  this._statusList = data.statusList;       // массив состояний в игре

  this._portConfig = ports.config;
  this._portAuth = ports.auth;
  this._portAuthErr = ports.authErr;
  this._portMap = ports.map;
  this._portShot = ports.shot;
  this._portInform = ports.inform;
  this._portClear = ports.clear;
  this._portLog = ports.log;

  this._users = {};                         // игроки
  this._resultVoteMaps = {};                // результаты голосования
  this._respawns = {};                      // респауны
  this._statList = [];                      // статистика
  this._messageList = [];                   // сообщения

  this._roundTimer;
  this._shotTimer;
  this._mapTimer;

  //this._amountUsersInStatus = {};           // общее количество игроков

  this.startGame();
}

// стартует игру
Game.prototype.startGame = function () {
  this.startMapTimer();
  this.startShotTimer();
  this.startRoundTimer();
};

// останавливает игру
Game.prototype.stopGame = function () {
  clearInterval(this._shotTimer);
  clearTimeout(this._roundTimer);
  clearTimeout(this._mapTimer);
};

// стартует карту
Game.prototype.startMapTimer = function () {
  this.updateCurrentMap();
  this.sendCurrentMap();
  this.sendForAll(this._portLog, ['System', 'new map']);

  this._mapTimer = setTimeout((function () {
    this.sendVoteMap();
  }).bind(this), this._mapTime);
};

// останавливает карту
Game.prototype.stopMapTimer = function () {
  clearTimeout(this._mapTimer);
};

// стартует раунд
Game.prototype.startRoundTimer = function () {
  this.startRound();
  this._roundTimer = setTimeout((function () {
    this.sendForAll(this._portLog, ['System', 'round end']);
    this.startRoundTimer();
    this.sendForAll(this._portLog, ['System', 'round start']);
  }).bind(this), this._roundTime);
};

// останавливает раунд
Game.prototype.stopRoundTimer = function () {
  this.sendForAll(this._portLog, ['System', 'round stop']);
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
  clearInterval(this._shotTimer);
};

// отправляет голосование за новую карту
Game.prototype.sendVoteMap = function () {
  var data = [
    'changeMap',
    [
      'Выберете следующую карту',
      ['mini', 'arena'],
      null
    ]
  ];

  this.sendForAll(this._portLog, data);

  // собирает результаты голосования и стартует новую игру
  setTimeout((function () {
    this.stopRoundTimer();
    this.stopShotTimer();

    this.sendForAll(this._portInform, [3]);

    setTimeout((function () {
      this.startMapTimer();
      this.startRoundTimer();
      this.startShotTimer();
    }).bind(this), 2000);
  }).bind(this), this._voteMapTime);
};

// обновить текущую карту
Game.prototype.updateCurrentMap = function () {
  var map = this._currentMap
    , votes = 0
    , p;

  for (p in this._resultVoteMaps) {
    if (this._resultVoteMaps.hasOwnProperty(p)) {
      if (this._resultVoteMaps[p] > votes) {
        map = p;
        votes = this._resultVoteMaps[p];
      }
    }
  }

  // если карта существует
  if (this._maps[map]) {
    this._currentMap = map;
  // иначе назначить первую из списка
  } else {
    this._currentMap = this._mapList[0];
  }

  this._respawns = this._maps[this._currentMap].respawns;
  this._resultVoteMaps = {};
};

// создает кадр игры
Game.prototype.createShot = function () {
  var data = []
    , gameData = {}
    , p
    , message;

  data[0] = null;      // game
  data[1] = null;      // coords
  data[2] = null;      // panel
  data[3] = null;      // stat
  data[4] = null;      // chat
  data[5] = null;      // vote

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p] === null) {
        gameData[p] = null;
        delete this._users[p];
      } else if (this._users[p].ready) {
        if (this._users[p].team !== 'spectators') {
          this._users[p].updateData();
          gameData[p] = this._users[p].data;

          this._statList[0].push([
            ~~p, this._users[p].data[4], this._users[p].getStat(), 0
          ]);
        } else {
          this._statList[0].push([
            ~~p, this._users[p].data[4], [this._users[p].data[5]], 0
          ]);
        }

      }
    }
  }

  data[0] = [[[1, 2], gameData, 1]];
  data[3] = this._statList;

  message = this._messageList.pop();

  if (message) {
    if (message.only === false) {
      data[4] = [message.name, message.message, message.type];
    }
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p].ready) {
        data[1] = [this._users[p].data[0], this._users[p].data[1]];
        data[2] = this._users[p].panel;

        this._users[p].socket.send(this._portShot, data);
      }
    }
  }

  this._statList[0] = [];

};

// отправляет данные всем
Game.prototype.sendForAll = function (port, data) {
  var p;

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p] !== null) {
        this._users[p].socket.send(port, data);
      }
    }
  }
};

// отправляет текущую карту
Game.prototype.sendCurrentMap = function (gameID) {
  var map = this._maps[this._currentMap]
    , data = {
      map: map.map,
      step: map.step,
      spriteSheet: map.spriteSheet,
      options: map.options
    }
    , p;

  if (gameID) {
    this._users[gameID].ready = false;
    this._users[gameID].socket.send(this._portMap, data);
  } else {
    for (p in this._users) {
      if (this._users.hasOwnProperty(p)) {
        if (this._users[p] !== null) {
          this._users[p].ready = false;
          this._users[p].socket.send(this._portMap, data);
        }
      }
    }
  }
};

// сообщает о загрузке карты
Game.prototype.mapReady = function (err, gameID) {
  if (!err) {
    this._users[gameID].ready = true;
    this._users[gameID].socket.send(this._portInform);
  }
};

// стартует раунд
Game.prototype.startRound = function () {
  var p
    , data
    , c = {};

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p] !== null) {
        c[this._users[p].team] = c[this._users[p].team] || 0;
        data = this._respawns[this._users[p].team];

        if (data) {
          data = data[c[this._users[p].team]];
          this._users[p].setData(data);

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
        if (this._users[p] !== null && this._users[p].data[5] === name) {
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

  this._users[gameID] = new User({
    team: this._statusList[team],
    name: name,
    gameID: gameID
  });
  this._users[gameID].socket = socket;
  this._users[gameID].team = team;
  this._users[gameID].ready = false;

  this.startRound();

  process.nextTick((function () {
    cb(gameID);
    this._users[gameID].socket.send(this._portInform);
    this.sendCurrentMap(gameID);
  }).bind(this));
};

// удаляет игрока
Game.prototype.removeUser = function (gameID, cb) {
  var bool = false;

  if (this._users[gameID]) {
    this._statList[0].push([gameID, this._users[gameID].data[4], null, 0]);
    this._users[gameID] = null;
    bool = true;
  }

  process.nextTick(function () {
    cb(bool);
  });
};

// возвращает количество игроков
Game.prototype.getAmountUsersInStatus = function () {
  //return this._amountUsersInStatus;
};

// обновляет команды
Game.prototype.updateKeys = function (gameID, keys) {
  this._users[gameID].updateKeys(keys);
};

// добавляет сообщение
Game.prototype.addMessage = function (gameID, message) {
  this._messageList.push({
    gameID: gameID,
    name: this._users[gameID].data[5],
    message: message,
    type: this._users[gameID].data[4] + 1,
    only: false
  });
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

    if (name === 'changeMap') {
      if (value[0] in this._resultVoteMaps) {
        this._resultVoteMaps[value[0]] += 1;
      } else {
        this._resultVoteMaps[value[0]] = 1;
      }
    } else if (name === 'status') {
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
