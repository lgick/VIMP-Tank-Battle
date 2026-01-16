import { buildSystemMessage } from './systemMessages.js';

// Singleton Chat

let chat;

class Chat {
  constructor() {
    if (chat) {
      return chat;
    }

    chat = this;

    this._list = [];
    this._userList = new Map();
  }

  // добавляет пользователя
  addUser(gameId) {
    this._userList.set(gameId, []);
  }

  // удаляет пользователя
  removeUser(gameId) {
    this._userList.delete(gameId);
  }

  // добавляет сообщение
  push(message, name, teamId) {
    this._list.push([message, name, teamId]);
  }

  // добавляет системное сообщение для всех
  // message может быть:
  // - шаблонным сообщением '<группа шаблонов>:<номер шаблона>:<параметры>'
  // - сообщением в виде массива [<текст сообщения>]
  pushSystem(message, params) {
    if (typeof message === 'string') {
      this._list.push(buildSystemMessage(message, params));
    } else {
      this._list.push(message);
    }
  }

  // добавляет системное сообщение для пользователя
  pushSystemByUser(gameId, message, params) {
    if (typeof message === 'string') {
      this._userList.get(gameId)?.push(buildSystemMessage(message, params));
    } else {
      this._userList.get(gameId)?.push(message);
    }
  }

  // возвращает сообщение
  shift() {
    return this._list.shift();
  }

  // возвращает сообщение для пользователя
  shiftByUser(gameId) {
    return this._userList.get(gameId)?.shift();
  }
}

export default Chat;
