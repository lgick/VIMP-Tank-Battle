// Singleton Vote
let vote;

class Vote {
  constructor() {
    if (vote) {
      return vote;
    }

    vote = this;

    this._list = []; // данные для всех игроков
    this._userList = {}; // данные для игрока
    this._votes = {}; // данные голосований
  }

  // сбрасывает данные
  reset() {
    this._list = [];

    for (const gameID in this._userList) {
      if (this._userList.hasOwnProperty(gameID)) {
        this._userList[gameID] = [];
      }
    }

    this._votes = {};
  }

  // добавляет пользователя
  addUser(gameID) {
    this._userList[gameID] = [];
  }

  // удаляет пользователя
  removeUser(gameID) {
    delete this._userList[gameID];
  }

  // добавляет данные голосования
  push(arr) {
    this._list.push(arr);
  }

  // добавляет данные голосования для пользователя
  pushByUser(gameID, arr) {
    this._userList[gameID].push(arr);
  }

  // возвращает данные
  shift() {
    return this._list.shift();
  }

  // возвращает данные для пользователя
  shiftByUser(gameID) {
    return this._userList[gameID].shift();
  }

  // создает голосование со сбором голосов
  createVote(arr, userList) {
    this._votes[arr[0][0]] = {};

    if (userList) {
      for (let i = 0, len = userList.length; i < len; i += 1) {
        this.pushByUser(userList[i], arr);
      }
    } else {
      this.push(arr);
    }
  }

  // добавляет голос в голосование
  addInVote(name, value) {
    const vote = this._votes[name];

    if (vote) {
      if (vote[value]) {
        vote[value] += 1;
      } else {
        vote[value] = 1;
      }
    }
  }

  // возвращает результат голосования
  getResult(name) {
    const results = this._votes[name];
    let votes = 0;
    let result;

    if (!results) {
      return;
    }

    for (const p in results) {
      if (results.hasOwnProperty(p)) {
        if (results[p] > votes) {
          result = p;
          votes = results[p];
        }
      }
    }

    delete this._votes[name];

    return result;
  }
}

export default Vote;
