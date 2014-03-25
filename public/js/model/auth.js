define(['Publisher'], function (Publisher) {
  // Singleton AuthModel
  var authModel;

  function AuthModel(socket) {
    if (authModel) {
      return authModel;
    }

    authModel = this;

    this._data = {};
    this._options = {};
    this._errors = [];
    this._sendStatus = false;

    this._socket = socket;

    this.publisher = new Publisher();
  }

  // добавляет данные
  AuthModel.prototype.add = function (data) {
    this._data[data.name] = data.value;
    this._options[data.name] = data.options;

    this.publisher.emit('form', {
      name: data.name,
      value: data.value
    });
  }

  // обновление данных
  // если value невалиден, возвращается текущий value
  AuthModel.prototype.update = function (data) {
    var name = data.name
      , value = data.value
      , regExp = this._options[name].regExp;

    if (regExp) {
      if (regExp.test(value)) {
        this._data[name] = value;
      } else {
        this._data[name] = value = '';
      }
    } else {
      this._data[name] = value;
    }

    this.publisher.emit('form', {
      name: name,
      value: value
    });
  };

  // валидация всех данных
  AuthModel.prototype.validate = function () {
    var data = this._data
      , regExp
      , p;

    for (p in data) {
      if (data.hasOwnProperty(p)) {
        regExp = this._options[p].regExp;

        if (regExp && !regExp.test(data[p])) {
          this._errors.push({name: p, value: data[p]});
        }
      }
    }
  };

  // отправка данных на сервер
  AuthModel.prototype.send = function () {
    if (this._errors.length) {
      this.publisher.emit('error', this._errors);
      this._errors = [];
    } else {
      if (this._sendStatus) {
        return;
      }

      this._socket.emit('auth', this._data, this.parseRes.bind(this));

      this._sendStatus = true;
    }
  };

  // разбор ответа сервера
  AuthModel.prototype.parseRes = function (err, auth) {
    var arr = []
      , data = this._data
      , p
      , name;

    // если авторизация успешна
    if (auth === true) {
      for (p in data) {
        if (data.hasOwnProperty(p)) {
          name = this._options[p].storage;

          if (name) {
            arr.push({name: name, value: data[p]});
          }
        }
      }

      this.publisher.emit('ok', arr);
    // иначе
    } else {
      this.publisher.emit('error', err);
      this._sendStatus = false;
    }
  };

  return AuthModel;
});
