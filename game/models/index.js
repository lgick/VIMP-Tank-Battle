var User = require('./user');
var Panel = require('./panel');
var Stat = require('./stat');
var Chat = require('./chat');
//var Vote = require('./vote');

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
  this._resultVoteMaps = {};                // результаты голосования
  this._respawns = {};                      // респауны
  this._voteList = [];                      // голосования

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
  this.stat = new Stat(this._users, this._statusList);
  this.chat = new Chat(this._users);

  this.startGame();
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
  clearInterval(this._stepTimer)
  clearInterval(this._shotTimer);
  clearTimeout(this._roundTimer);
  clearTimeout(this._mapTimer);
};

// стартует карту
Game.prototype.startMapTimer = function () {
  this.updateCurrentMap();
  this.sendCurrentMap();

  this.chat.push('new map');

  this._mapTimer = setTimeout((function () {
    this.sendVoteMap();
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
    this.chat.push('next round');
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

// отправляет голосование за новую карту
Game.prototype.sendVoteMap = function () {
  var data = [
    'map',
    [
      'Выберете следующую карту',
      ['mini', 'arena'],
      null
    ]
  ];

  this.chat.push(data);
  this._voteList.push(data);

  // собирает результаты голосования и стартует новую игру
  setTimeout((function () {
    this.stopGame();

    this.sendForAll(this._portInform, [3]);

    setTimeout((function () {
      this.startGame();
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
    this._users[gameID].ready = true;
  }
};

// отправляет первый shot
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
  teamID = this._statusList[this._users[gameID].team];

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
    this.stat.createUser(gameID);

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
  vote = this._voteList.shift();

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
      voteUser = user.voteList.shift() || 0;
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
        this.sendFirstShot(p);
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
      if (emptyTeam) {
        message = team + ' is full. Current team: ' + emptyTeam;
        team = emptyTeam;
      } else {
        message = 'Teams is full. Current status: spectators';
        team = 'spectators';
      }
    } else {
      message = 'Current team: ' + team;
    }
  } else {
    message = 'Current status: spectators';
  }

  if (this._allUsersInTeam[team]) {
    this._allUsersInTeam[team] += 1;
  } else {
    this._allUsersInTeam[team] = 1;
  }

  this._users[gameID] = new User(name, team);

  this._users[gameID].socket = socket;
  this._users[gameID].ready = false;

  this.chat.addUser(gameID);
  this.chat.pushByUser(message, gameID);

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
    this.stat.removeUser(gameID);

    this._allUsersInTeam[this._users[gameID].team] -= 1;

    // если игрок был в spectators, то удалить
    if (this._users[gameID].team === 'spectators') {
      delete this._users[gameID];
    // иначе сделать null, чтобы удалить экземпляр на клиенте
    } else {
      this._users[gameID] = null;
    }

    this.panel.removeUser(gameID);
    this.chat.removeUser(gameID);

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

// обрабатывает vote данные
Game.prototype.parseVote = function (gameID, data) {
  var name
    , value;

  // если данные 'строка' (запрос данных)
  if (typeof data === 'string') {
    if (data === 'maps') {
      this._users[gameID].addVoteData(this._mapList);
    }
  // если данные 'объект' (результат голосования)
  } else if (typeof data === 'object') {
    name = data[0];
    value = data[1][0];

    // если смена карты системой
    if (name === 'map') {
      if (value[0] in this._resultVoteMaps) {
        this._resultVoteMaps[value] += 1;
      } else {
        this._resultVoteMaps[value] = 1;
      }
    // если смена карты пользователем
    } else if (name === 'mapUser') {
      console.log(value);
    // если смена статуса
    } else if (name === 'status') {
      if (this._users[gameID].team !== value) {
        this._allUsersInTeam[this._users[gameID].team] -= 1;

        this._users[gameID].changeTeam(value);

        if (this._allUsersInTeam[value]) {
          this._allUsersInTeam[value] += 1;
        } else {
          this._allUsersInTeam[value] = 1;
        }

        this.chat.pushByUser('Your next status: ' + value, gameID);
      }
    }
  }
};

module.exports = Game;
