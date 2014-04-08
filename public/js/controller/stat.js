define([], function () {
  // Singleton StatCtrl
  var statCtrl;

  function StatCtrl(model, view) {
    if (statCtrl) {
      return statCtrl;
    }

    statCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;
  }

  // открывает статистику
  StatCtrl.prototype.open = function () {
    this._model.open();
  };

  // закрывает статистику
  StatCtrl.prototype.close = function () {
    this._model.close();
  };

  // обновляет
  StatCtrl.prototype.update = function (data) {
  };

  return StatCtrl;
});
