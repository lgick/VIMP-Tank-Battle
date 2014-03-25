define(['Publisher'], function (Publisher) {
  // Singleton PanelView
  var panelView;

  function PanelView(model, data) {
    if (panelView) {
      return panelView;
    }

    panelView = this;

    this._window = data.window;
    this._panel = data.panel;

    this._document = this._window.document;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('data', 'update', this);
  }

  // обновляет пользовательскую панель
  PanelView.prototype.update = function (data) {
    var elem = this._document.getElementById(this._panel[data.name]);

    if (elem) {
      elem.innerHTML = data.value;
    }
  };

  return PanelView;
});
