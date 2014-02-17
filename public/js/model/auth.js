define(['Publisher'], function (Publisher) {
  // Singleton AuthModel
  var authModel;

  function AuthModel(data) {
    if (authModel) {
      return authModel;
    }

    authModel = this;

    this._data = {};
    this._options = {};
    this._errData = {};

    this._socket = data.socket;

    this.publisher = new Publisher();
  }

  AuthModel.prototype.add = function (data) {
    this._data[data.name] = data.value;
    this._options[data.name] = data.options;
  }

  // обновление данных
  // если value невалиден, возвращается текущий value
  AuthModel.prototype.update = function (data) {
    var name = data.name
      , value = data.value;

    // если значение по заданному типу соответствует
    if (this._listExp[name].test(value)) {
      this._data[name] = value;
    } else {
      value = this._data[name] || '';
    }

    this.publisher.emit('form', {
      name: name,
      value: value
    });
  };

  // валидация всех данных
  AuthModel.prototype.validate = function () {
    var data = this._data
      , bugs = []
      , p;

    for (p in data) {
      if (data.hasOwnProperty(p)) {
        if (!this._listExp[p].test(data[p])) {
          bugs.push({name: p, value: data[p]});
        }
      }
    }
  };

  // отправка данных на сервер
  AuthModel.prototype.send = function () {
    var that = this;

    if (bugs.length) {
      this.publisher.emit('error', bugs);
    } else {
      this._socket.emit('auth', data, function (res) {
        if (res.auth === true) {
          that.publisher.emit('ok');
        } else {
        }
      });
    }
  };

  return AuthModel;
});
