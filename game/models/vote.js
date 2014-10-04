// Singleton Vote
var vote;

function Vote(data) {
  if (vote) {
    return vote;
  }

  vote = this;

  this._voteMapTime = data.voteMapTime;     // время ожидания голосования
  this._voteMapAmount = data.voteMapAmount; // всего карт в голосовании
  this._resultVoteMaps = {};                // результаты голосования
  this._voteList = [];                      // голосования
}

Vote.prototype.add = function (id) {
};

Vote.prototype.remove = function (id) {
};

Vote.prototype.update = function (id, data) {
};

Vote.prototype.read = function (id) {
};

// обрабатывает vote данные
Vote.prototype.parseVote = function (gameID, data) {
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

        this._users[gameID].addMessage('Your next status: ' + value);
      }
    }
  }
};

module.exports = Vote;
