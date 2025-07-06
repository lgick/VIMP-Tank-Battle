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

    for (const gameId in this._userList) {
      if (Object.hasOwn(this._userList, gameId)) {
        this._userList[gameId] = [];
      }
    }

    this._votes = {};
  }

  // добавляет пользователя
  addUser(gameId) {
    this._userList[gameId] = [];
  }

  // удаляет пользователя
  removeUser(gameId) {
    delete this._userList[gameId];
  }

  // добавляет данные голосования
  push(arr) {
    this._list.push(arr);
  }

  // добавляет данные голосования для пользователя
  pushByUser(gameId, arr) {
    this._userList[gameId].push(arr);
  }

  // возвращает данные
  shift() {
    return this._list.shift();
  }

  // возвращает данные для пользователя
  shiftByUser(gameId) {
    return this._userList[gameId].shift();
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

  // возвращает результат голосования с обработкой ничьей
  getResult(name) {
    const results = this._votes[name];
    let maxVotes = 0;
    let winners = []; // массив для хранения победителей

    if (!results || Object.keys(results).length === 0) {
      delete this._votes[name];
      return;
    }

    // поиск победителей
    for (const option in results) {
      if (Object.hasOwn(results, option)) {
        const currentVotes = results[option];

        // если текущий вариант набрал больше голосов,
        // он становится единственным лидером
        if (currentVotes > maxVotes) {
          maxVotes = currentVotes;
          winners = [option];
          // если голосов столько же, добавляем в список победителей (ничья)
        } else if (currentVotes === maxVotes) {
          winners.push(option);
        }
      }
    }

    delete this._votes[name];

    // если никто не проголосовал
    if (winners.length === 0) {
      return;
    }

    // если победитель один
    if (winners.length === 1) {
      return winners[0];
    }

    // случайный выбор, если победителей несколько
    const randomIndex = Math.floor(Math.random() * winners.length);

    return winners[randomIndex];
  }
}

export default Vote;
