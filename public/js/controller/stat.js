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

  return StatCtrl;
});
