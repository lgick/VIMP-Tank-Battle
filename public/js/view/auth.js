define(['Publisher'], function (Publisher) {
  // Singleton AuthView
  var authView;

  function AuthView(model, data) {
    if (authView) {
      return authView;
    }

    authView = this;

    this._mPublic = model.publisher;

    this._window = data.window;
    this._auth = data.auth;
    this._form = data.form;
    this._error = data.error;
    this._enter = data.enter;

    this.publisher = new Publisher();

    // действие с инпутами
    this._form.onchange = function (e) {
      var tg = e.target;

      if (tg.tagName === 'INPUT') {
        authView.publisher.emit('input', {
          name: tg.name,
          value: tg.value
        });
      }
    };

    // форма заполнена
    this._enter.onclick = function () {
      authView.publisher.emit('enter');
    };

    this._mPublic.on('form', 'renderData', this);
    this._mPublic.on('error', 'renderError', this);
    this._mPublic.on('ok', 'hideAuth', this);
  }

  // показывает форму
  AuthView.prototype.showAuth = function () {
    this._auth.style.display = 'block';
  };

  // скрывает форму
  AuthView.prototype.hideAuth = function (data) {
    if (data) {
      var storage = this._window.localStorage
        , i = 0
        , len = data.length;

      for (; i < len; i += 1) {
        storage[data[i].name] = data[i].value;
      }
    }

    this._auth.style.display = 'none';
  };

  // обновляет форму
  AuthView.prototype.renderData = function (data) {
    var name = data.name
      , value = data.value
      , list = this._form.querySelectorAll('input')
      , i = 0
      , len = list.length
      , input;

    this._error.innerHTML = '';

    // делает активным нужный инпут
    for (; i < len; i += 1) {
      var input = list[i];

      if (input.type === 'text') {
        if (input.name === name) {
          input.value = value;
        }
      }

      if (input.type === 'radio') {
        if (input.name === name) {
          if (input.value === value) {
            input.checked = true;
          } else {
            input.checked = false;
          }
        }
      }
    }
  };

  // отображает ошибки
  AuthView.prototype.renderError = function (data) {
    var i = 0
      , len = data.length
      , message = ''
      , err
      , name;

    for (; i < len; i += 1) {
      name = data[i].name.toUpperCase();
      err = data[i].error;

      if (err) {
        message += name + ': ' + err + '<br>';
      } else {
        message += name + ' is not correctly!<br>';
      }
    }

    this._error.innerHTML = message;
  };

  return AuthView;
});
