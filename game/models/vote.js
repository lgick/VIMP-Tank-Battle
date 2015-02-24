// Singleton Vote
var vote;

function Vote() {
  if (vote) {
    return vote;
  }

  vote = this;

  this._list = [];              // данные для всех игроков
  this._userList = {};          // данные для игрока
  this._votes = {};             // данные голосований
}

// добавляет пользователя
Vote.prototype.addUser = function (gameID) {
  this._userList[gameID] = [];
};

// удаляет пользователя
Vote.prototype.removeUser = function (gameID) {
  delete this._userList[gameID];
};

// добавляет данные голосования
Vote.prototype.push = function (arr) {
  this._list.push(arr);
};

// добавляет данные голосования для пользователя
Vote.prototype.pushByUser = function (gameID, arr) {
  this._userList[gameID].push(arr);
};

// возвращает данные
Vote.prototype.shift = function () {
  return this._list.shift();
};

// возвращает данные для пользователя
Vote.prototype.shiftByUser = function (gameID) {
  return this._userList[gameID].shift();
};

// создает голосование
Vote.prototype.createVote = function (name, arr, userList) {
  var i
    , len;

  this._votes[name] = {};

  if (userList) {
    for (i = 0, len = userList.length; i < len; i += 1) {
      this.pushByUser(userList[i], [name, arr]);
    }
  } else {
    this.push([name, arr]);
  }
};

// добавляет голос в голосование
Vote.prototype.addInVote = function (name, value) {
  if (this._votes[name][value]) {
    this._votes[name][value] += 1;
  } else {
    this._votes[name][value] = 1;
  }
};

// возвращает результат голосования
Vote.prototype.getResult = function (name) {
  var results = this._votes[name]
    , votes = 0
    , p
    , result;

  for (p in results) {
    if (results.hasOwnProperty(p)) {
      if (results[p] > votes) {
        result = p;
        votes = results[p];
      }
    }
  }

  return result;
};

module.exports = Vote;
