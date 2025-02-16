define([], function () {
  // Singleton UserCtrl
  var userCtrl;

  function UserCtrl(model, view) {
    if (userCtrl) {
      return userCtrl;
    }

    userCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;

    this._vPublic.on('keyDown', 'add', this);
    this._vPublic.on('keyUp', 'remove', this);
    this._vPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserCtrl.prototype.init = function (data) {
    this.resize(data);
    this._model.init();
  };

  // добавляет клавишу
  UserCtrl.prototype.add = function (event) {
    this._model.addKey(event);
  };

  // удаляет клавишу
  UserCtrl.prototype.remove = function (event) {
    this._model.removeKey(event);
  };

  // задает текущий режим
  UserCtrl.prototype.switchMode = function (data) {
    this._model.setMode(data.name, data.status);
  };

  // меняет набор клавиш
  UserCtrl.prototype.changeKeySet = function (keySet) {
    this._model.changeKeySet(keySet);
  };

  // обновляет размеры
  UserCtrl.prototype.resize = function (data) {
    this._model.resize(data);
  };

  return UserCtrl;
});
