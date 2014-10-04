// Singleton Chat
var chat;

function Chat(users) {
  if (chat) {
    return chat;
  }

  chat = this;

  this._users = users;
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
Chat.prototype.push = function (text, gameID) {
  if (gameID) {
    this._list.push([
      text,
      this._users[gameID].name,
      this._users[gameID].teamID
    ]);
  } else {
    this._list.push([text]);
  }
};

// добавляет сообщение для пользователя
Chat.prototype.pushByUser = function (text, gameID) {
  this._userList[gameID].push([text]);
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
