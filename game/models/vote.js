// Singleton Vote
var vote;

function Vote(users, data) {
  var mapData
    , voteData
    , Publisher;

  if (vote) {
    return vote;
  }

  mapData = data.map;
  voteData = data.vote;
  Publisher = data.utils.Publisher;

  vote = this;

  this._users = users;

  this._mapList = Object.keys(mapData.maps);   // список карт
  this._teamList = Object.keys(data.teams);    // список команд

  this._currentMap = mapData.currentMap;

  this._time = voteData.time;
  this._timeBlockedRemap = voteData.timeBlockedRemap;
  this._mapsInVote = voteData.mapsInVote;

  this._startMapNumber = 0;     // номер первой карты в голосовании
  this._list = [];              // данные для всех игроков
  this._userList = {};          // данные для игрока

  this._resultVoteMaps = {};    // результаты голосования за карту
  this._blockedRemap = false;   // флаг блокировки возможности голосования

  this.publisher = new Publisher();
}

// добавляет пользователя
Vote.prototype.addUser = function (gameID) {
  this._userList[gameID] = [];
};

// удаляет пользователя
Vote.prototype.removeUser = function (gameID) {
  delete this._userList[gameID];
};

// обрабатывает данные от пользователя
Vote.prototype.parseVote = function (gameID, data) {
  var name
    , value
    , p
    , dataArr = [];

  // если данные 'строка' (запрос данных)
  if (typeof data === 'string') {
    // если запрос списка команд
    if (data === 'teams') {
      this._userList[gameID].push([null, this._teamList]);

    // если запрос всех карт
    } else if (data === 'maps') {
      this._userList[gameID].push([null, this._mapList]);

    // если запрос пользователей
    } else if (data === 'users') {
      for (p in this._users) {
        if (this._users.hasOwnProperty(p)) {
          dataArr.push(this._users[p].name + ':' + p);
        }
      }

      this._userList[gameID].push([null, dataArr]);
    }

  // если данные 'объект' (результат голосования)
  } else if (typeof data === 'object') {
    name = data[0];
    value = data[1];

    // если смена карты системой
    if (name === 'changeMap') {
      value = value[0];

      if (this._resultVoteMaps[value]) {
        this._resultVoteMaps[value] += 1;
      } else {
        this._resultVoteMaps[value] = 1;
      }

      this.publisher.emit('chat', ['v:0', gameID]);

    // если смена карты пользователем
    } else if (name === 'mapUser') {
      value = value[0];

      if (value === this._currentMap) {
        this.publisher.emit('chat', ['v:1:' + value, gameID]);
      } else {
        this.changeMap(gameID.toString(), value);
      }

    // если смена статуса
    } else if (name === 'team') {
      value = value[0];

      if (value !== this._users[gameID].team) {
        this.publisher.emit('team', {
          team: value,
          oldTeam: this._users[gameID].team,
          gameID: gameID
        });
      } else {
        this.publisher.emit('chat', ['s:2:' + value, gameID]);
      }

    // если смена статуса
    } else if (name === 'ban') {
      this.publisher.emit('chat', [
        'v:6:' + value[1] + ',' + this._users[value[0]].name, gameID
      ]);
    }
  }
};

// отправляет голосование за новую карту
Vote.prototype.changeMap = function (gameID, map) {
  var user
    , data;

  function getMaps() {
    var maps
      , endNumber;

    if (this._mapList.length <= this._mapsInVote) {
      return this._mapList;
    }

    endNumber = this._startMapNumber + this._mapsInVote;
    maps = this._mapList.slice(this._startMapNumber, endNumber);

    if (maps.length < this._mapsInVote) {
      endNumber = this._mapsInVote - maps.length;
      maps = maps.concat(this._mapList.slice(0, endNumber));
    }

    this._startMapNumber = endNumber;

    return maps;
  }

  // если смена карты возможна
  if (this._blockedRemap === false) {
    this._blockedRemap = true;
    this._resultVoteMaps = {};

    // если есть gameID и карта (голосование создает пользователь)
    if (gameID && map) {
      this._resultVoteMaps[map] = 1;

      data = [
        'changeMap',
        [
          this._users[gameID].name + ' предложил карту: ' + map,
          ['Сменить:' + map, 'Не менять:'],
          null
        ]
      ];

      for (user in this._userList) {
        if (this._userList.hasOwnProperty(user)) {
          if (user !== gameID) {
            this._userList[user].push(data);
          }
        }
      }

      this.publisher.emit('chat', ['v:2', gameID]);

    // иначе голосование создает игра
    } else {
      data = [
        'changeMap',
        [
          'Выберете следующую карту',
          getMaps.call(this),
          null
        ]
      ];

      this._list.push(data);
    }

    // собирает результаты голосования и стартует новую игру
    setTimeout((function () {
      this.updateCurrentMap();

      // снимает блокировку смены карты
      setTimeout((function () {
        this._blockedRemap = false;
      }).bind(this), this._timeBlockedRemap);
    }).bind(this), this._time);

  } else {
    if (gameID) {
      this.publisher.emit('chat', ['v:3', gameID]);
    }
  }
};

// обновляет текущую карту
Vote.prototype.updateCurrentMap = function () {
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

  // если есть результат и карта существует
  if (map && this._mapList.indexOf(map) !== -1) {
    this._currentMap = map;
    this.publisher.emit('chat', ['v:4:' + map]);
    setTimeout((function () {
      this.publisher.emit('map');
    }.bind(this)), 2000);
  } else {
    this.publisher.emit('chat', ['v:5']);
  }
};

// возвращает текущую карту
Vote.prototype.getCurrentMap = function () {
  return this._currentMap;
};

// возвращает данные
Vote.prototype.shift = function () {
  return this._list.shift();
};

// возвращает данные пользователя
Vote.prototype.shiftByUser = function (gameID) {
  return this._userList[gameID].shift();
};

module.exports = Vote;
