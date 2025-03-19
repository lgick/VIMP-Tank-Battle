import Publisher from '../../../server/lib/publisher.js';

// Singleton PanelView

let panelView;

export default class PanelView {
  constructor(model, data) {
    if (panelView) {
      return panelView;
    }

    panelView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._panel = data.panel;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('data', 'update', this);
  }

  // обновляет пользовательскую панель
  update(data) {
    const elem = this._document.getElementById(
      this._panel[data.name],
    );

    if (elem) {
      if (data.value === '') {
        elem.style.display = 'none';
      } else {
        elem.innerHTML = data.value;
        elem.style.display = 'table-cell';
      }
    }
  }
}
