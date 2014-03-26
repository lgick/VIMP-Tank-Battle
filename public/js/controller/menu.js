define([], function () {
  // Singleton MenuCtrl
  var menuCtrl;

  function MenuCtrl(model, view) {
    if (menuCtrl) {
      return menuCtrl;
    }

    menuCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;
  }

  return MenuCtrl;
});
