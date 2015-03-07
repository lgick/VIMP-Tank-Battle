// Singleton Panel
var panel;

function Panel(config) {
  var counter = 0
    , p;

  if (panel) {
    return panel;
  }

  panel = this;

  this._config = config;
  this._emptyPanel = [];

  this._data = {};

  for (p in this._config) {
    if (this._config.hasOwnProperty(p)) {
      this._emptyPanel[counter] = '';
      counter += 1;
    }
  }
}

// сбрасывает данные пользователей
Panel.prototype.reset = function () {
  var gameID
    , user;

  for (gameID in this._data) {
    if (this._data.hasOwnProperty(gameID)) {
      user = this._data[gameID];

      user.values = this.getDefault(user.values);
      user.status = true;
    }
  }
};

// возвращает дефолтные данные
Panel.prototype.getDefault = function (panel) {
  var p
    , conf;

  panel = panel || [];

  for (p in this._config) {
    if (this._config.hasOwnProperty(p)) {
      conf = this._config[p];

      if (typeof conf.value !== 'undefined') {
        panel[conf.key] = conf.value;
      }
    }
  }

  return panel;
};

// добавляет пользователя
Panel.prototype.addUser = function (gameID) {
  this._data[gameID] = {
    values: this.getDefault(),
    status: true
  };
};

// удаляет пользователя
Panel.prototype.removeUser = function (gameID) {
  delete this._data[gameID];
};

// обновляет данные пользователя
Panel.prototype.updateUser = function (gameID, param, value) {
  var user = this._data[gameID]
    , conf = this._config[param]
    , method = conf.method
    , minValue = conf.minValue
    , key = conf.key;

  // если метод 'уменьшение'
  if (method === '-') {
    value = user.values[key] - value;

  // иначе если метод 'замена'
  } else if (method === '=') {
  }

  // если есть минимально допустимое значение и оно больше текущего
  if (typeof minValue !== 'undefined' && value < minValue) {
    value = minValue;
  }

  user.values[key] = value;
  user.status = true;
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
  return this._emptyPanel;
};

module.exports = Panel;
