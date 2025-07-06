// Singleton Chat
let chat;

class Chat {
  constructor() {
    if (chat) {
      return chat;
    }

    chat = this;

    this._list = [];
    this._userList = {};
  }

  // добавляет пользователя
  addUser(gameId) {
    this._userList[gameId] = [];
  }

  // удаляет пользователя
  removeUser(gameId) {
    delete this._userList[gameId];
  }

  // добавляет сообщение
  push(message, name, teamId) {
    this._list.push([message, name, teamId]);
  }

  // добавляет системное сообщение
  // message может быть:
  // - шаблонным сообщением '<группа шаблонов>:<номер шаблона>:<параметры>'
  // - сообщением в виде массива [<текст сообщения>]
  pushSystem(message, gameId) {
    if (gameId) {
      this._userList[gameId].push(message);
    } else {
      this._list.push(message);
    }
  }

  // возвращает сообщение
  shift() {
    return this._list.shift();
  }

  // возвращает сообщение для пользователя
  shiftByUser(gameId) {
    return this._userList[gameId].shift();
  }
}

export default Chat;
