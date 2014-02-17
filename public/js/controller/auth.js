define([], function () {
  // Singleton AuthCtrl
  var authCtrl;

  function AuthCtrl(model, view) {
    if (authCtrl) {
      return authCtrl;
    }

    authCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;

    this._vPublic.on('input', 'update', this);
    this._vPublic.on('enter', 'send', this);
  }

  // инициализация
  AuthCtrl.prototype.init = function (data) {
    var i = 0
      , len = data.length;

    for (; i < len; i += 1) {
      this.update(data[i]);
    }

    this._view.showAuth();
  };

  // обновление
  AuthCtrl.prototype.update = function (data) {
    this._model.update(data);
  };

  // отправка данных
  AuthCtrl.prototype.send = function () {
    this._model.validate();
    this._model.send();
  };

  return AuthCtrl;
});
