// Singleton CanvasManagerCtrl

let canvasManagerCtrl;

export default class CanvasManagerCtrl {
  constructor(model, view) {
    if (canvasManagerCtrl) {
      return canvasManagerCtrl;
    }

    canvasManagerCtrl = this;

    this._model = model;
    this._view = view;
  }

  // обновляет представление относительно пользователя
  updateCoords(coords, forceReset) {
    this._model.updateCoords(coords, forceReset);
  }

  // обновляет размеры
  resize(data) {
    this._model.resize(data);
  }
}
