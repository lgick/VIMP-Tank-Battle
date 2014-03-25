define([], function () {
  // Singleton PanelCtrl
  var panelCtrl;

  function PanelCtrl(model, view) {
    if (panelCtrl) {
      return panelCtrl;
    }

    panelCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;
  }

  // обновляет пользовательскую панель
  PanelCtrl.prototype.update = function (data) {
    if (typeof data === 'object') {
      this._model.update(data);
    }
  };

  return PanelCtrl;
});
