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
  addUser(gameID) {
    this._userList[gameID] = [];
  }

  // удаляет пользователя
  removeUser(gameID) {
    delete this._userList[gameID];
  }

  // добавляет сообщение
  push(message, name, teamID) {
    this._list.push([message, name, teamID]);
  }

  // добавляет системное сообщение
  // message может быть:
  // - шаблонным сообщением '<группа шаблонов>:<номер шаблона>:<параметры>'
  // - сообщением в виде массива [<текст сообщения>]
  pushSystem(message, gameID) {
    if (gameID) {
      this._userList[gameID].push(message);
    } else {
      this._list.push(message);
    }
  }

  // возвращает сообщение
  shift() {
    return this._list.shift();
  }

  // возвращает сообщение для пользователя
  shiftByUser(gameID) {
    return this._userList[gameID].shift();
  }
}

export default Chat;
