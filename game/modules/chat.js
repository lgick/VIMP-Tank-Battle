// Singleton Chat
var chat;

function Chat() {
  if (chat) {
    return chat;
  }

  chat = this;

  this._list = [];
  this._userList = {};
}

// добавляет пользователя
Chat.prototype.addUser = function (gameID) {
  this._userList[gameID] = [];
};

// удаляет пользователя
Chat.prototype.removeUser = function (gameID) {
  delete this._userList[gameID];
};

// добавляет сообщение
Chat.prototype.push = function (message, name, teamID) {
  this._list.push([message, name, teamID]);
};

// добавляет системное сообщение
// message может быть:
// - шаблонным сообщением '<группа шаблонов>:<номер шаблона>:<параметры>'
// - сообщением в виде массива [<текст сообщения>]
Chat.prototype.pushSystem = function (message, gameID) {
  if (gameID) {
    this._userList[gameID].push(message);
  } else {
    this._list.push(message);
  }
};

// возвращает сообщение
Chat.prototype.shift = function () {
  return this._list.shift();
};

// возвращает сообщение для пользователя
Chat.prototype.shiftByUser = function (gameID) {
  return this._userList[gameID].shift();
};

module.exports = Chat;
