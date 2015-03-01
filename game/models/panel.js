// Singleton Panel
var panel;

function Panel() {
  if (panel) {
    return panel;
  }

  panel = this;

  this._healthDefault = 100;
  this._healthStep = 1;

  this._data = {};
}

// инициализация в начале раунда
Panel.prototype.init = function () {
  var gameID;

  for (gameID in this._data) {
    if (this._data.hasOwnProperty(gameID)) {
      this.addUser(gameID);
    }
  }
};

// добавляет пользователя
Panel.prototype.addUser = function (gameID) {
  this._data[gameID] = {
    values: [this._healthDefault],
    status: true
  };
};

// удаляет пользователя
Panel.prototype.removeUser = function (gameID) {
  delete this._data[gameID];
};

// возвращает данные
Panel.prototype.getPanel = function (gameID) {
  var user = this._data[gameID];

  if (user && user.status === true) {
    user.status = false;

    return user.values;
  }
};

// возвращает пустые данные
Panel.prototype.getEmpty = function () {
  return [''];
};

// обновляет health
Panel.prototype.updateHealth = function (gameID, power) {
  var user = this._data[gameID]
    , health = user.values[0] - this._healthStep * (power || 1);

  if (health < 0) {
    health = 0;
  }

  user.values[0] = health;
  user.status = true;
};

module.exports = Panel;
