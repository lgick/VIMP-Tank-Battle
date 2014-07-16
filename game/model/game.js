var User = require('./user');

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
  this._messageList = [];                   // сообщения
  this._voteList = [];                      // голосования
  this._statForRemove = [];                 // статистика для удаления

  this._roundTimer;
  this._shotTimer;
  this._mapTimer;

  this._firstShotMessage = {};              // сообщение приветствия
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

  this._messageList.push({text: 'new map'});

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
    this._currentBulletID = 0;
    this.startRoundTimer();
    this._messageList.push({text: 'next round'});
  }).bind(this), this._roundTime);
};

// останавливает раунд
Game.prototype.stopRoundTimer = function () {
  this._messageList.push({text: 'round stop'});
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

  this._messageList.push({text: data});
  this._voteList.push(data);

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

// обновляет текущую карту
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

// отправляет текущую карту
Game.prototype.sendCurrentMap = function (gameID) {
  var map = this._maps[this._currentMap]
    , data = {
      map: map.map,
      spriteSheet: map.spriteSheet,
      layers: map.layers,
      partID: map.partID,
      step: map.step
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
    this._users[gameID].socket.send(this._portInform);
    this.sendFirstShot(gameID);
    this._users[gameID].ready = true;
  }
};

// отправляет первый shot
Game.prototype.sendFirstShot = function (gameID) {
  // TODO: отправить всю текущую статистику
  // TODO: отправить системное чат сообщение о изменении команды
  var data = []
    , stat = []
    , p;

  data[0] = null;      // game
  data[1] = null;      // coords
  data[2] = null;      // panel
  data[3] = null;      // stat
  data[4] = null;      // chat
  data[5] = null;      // vote

  stat[0] = [];        // <tbody>
  stat[1] = [];        // <thead>

  data[2] = this._users[gameID].panel;

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      stat[0].push([
        p, this._users[p].data[4], this._users[p].stat, 0
      ]);
    }
  }

  // TODO: данные для <thead> общие и могут хранится в this
  stat[1] = [
    [0, [3, '', 20, ''], 0],
    [1, [4, '', 30, ''], 0]
  ];

  data[3] = stat;

  data[4] = [this._firstShotMessage[gameID]];

  delete this._firstShotMessage[gameID];

  this._users[gameID].socket.send(this._portShot, data);
};

// создает кадр игры
Game.prototype.createShot = function () {
  var data = []
    , gameData = {}
    , bulletData = {}
    , stat = []
    , p
    , bulletTime
    , bullet
    , oldBullets
    , bulletID
    , i
    , len
    , message
    , vote
  ;

  data[0] = null;      // game
  data[1] = null;      // coords
  data[2] = null;      // panel
  data[3] = null;      // stat
  data[4] = null;      // chat
  data[5] = null;      // vote

  stat[0] = [];        // <tbody>
  stat[1] = [];        // <thead>

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
      if (this._users[p] === null) {
        gameData[p] = null;
        delete this._users[p];
      } else if (this._users[p].ready) {
        // если статистика обновилась
        if (this._users[p].statStatus === true) {
          stat[0].push([
            p, this._users[p].data[4], this._users[p].stat, 0
          ]);

          this._users[p].statStatus = false;
        }

        if (this._users[p].team !== 'spectators') {
          this._users[p].updateData();
          gameData[p] = this._users[p].data;

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

  for (i = 0, len = this._statForRemove.length; i < len; i += 1) {
    stat[0].push(this._statForRemove[i]);
  }

  this._statForRemove = [];

  data[0] = [[[1, 2], gameData], [[3], bulletData]];

  if (stat[0].length || stat[1].length) {
    data[3] = stat;
  }

  message = this._messageList.pop();

  if (message) {
    data[4] = [message.text, message.name, message.type];
  }

  vote = this._voteList.pop();

  if (vote) {
    data[5] = vote;
  }

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      if (this._users[p].ready) {
        data[1] = [this._users[p].data[0], this._users[p].data[1]];

        if (this._users[p].panel) {
          data[2] = this._users[p].panel;
          this._users[p].panel = null;
        }

        this._users[p].socket.send(this._portShot, data);
      }
    }
  }
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
    , emptyTeam
    , gameID
    , message
  ;

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
  function getGameID() {
    var gameID = 1;

    while (this._users[gameID]) {
      gameID += 1;
    }

    return gameID;
  }

  gameID = getGameID.call(this);

  // ищет команды имеющие свободные респауны
  function searchEmptyTeam() {
    var team;

    for (team in this._respawns) {
      if (this._respawns.hasOwnProperty(team)) {
        if (this._respawns[team].length !== this._allUsersInTeam[team]) {
          return team;
        }
      }
    }
  }

  if (team !== 'spectators') {
    // если количество респаунов на карте в выбраной команде
    // равно количеству игроков в этой команде
    if (this._respawns[team].length === this._allUsersInTeam[team]) {
      emptyTeam = searchEmptyTeam.call(this);

      // если найдена команда с свободным местом
      // TODO придумать систему оповещения об изменении
      if (emptyTeam) {
        message = team + ' is full. Current team: ' + emptyTeam;
        team = emptyTeam;
      } else {
        message = 'All teams is full. Current status: spectators';
        team = 'spectators';
      }
    } else {
      message = 'Current team: ' + team;
    }
  } else {
    message = 'Current status: spectators';
  }

  this._firstShotMessage[gameID] = message;

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }

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

  // если gameID === undefined,
  // значит пользователь вышел, не успев войти в игру
  if (this._users[gameID]) {
    this._statForRemove.push([
      gameID, this._users[gameID].data[4], null, 0
    ]);

    this._allUsersInTeam[this._users[gameID].team] -= 1;

    // если игрок был в spectators, то удалить
    if (this._users[gameID].team === 'spectators') {
      delete this._users[gameID];
    // иначе сделать null, чтобы удалить экземпляр на клиенте
    } else {
      this._users[gameID] = null;
    }

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
Game.prototype.addMessage = function (gameID, text) {
  this._messageList.push({
    gameID: gameID,
    name: this._users[gameID].data[5],
    text: text,
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
