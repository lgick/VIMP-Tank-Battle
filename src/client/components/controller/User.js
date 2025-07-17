// Singleton UserCtrl

let userCtrl;

export default class UserCtrl {
  constructor(model, view) {
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
  init(data) {
    this.resize(data);
    this._model.init();
  }

  // добавляет клавишу
  add(event) {
    this._model.addKey(event);
  }

  // удаляет клавишу
  remove(event) {
    this._model.removeKey(event);
  }

  // задает текущий режим
  switchMode(data) {
    this._model.setMode(data.name, data.status);
  }

  // меняет набор клавиш
  changeKeySet(keySet) {
    this._model.changeKeySet(keySet);
  }

  // обновляет размеры
  resize(data) {
    this._model.resize(data);
  }

  // меняет статус готовности игрока к игре
  setPlayerReady(isReady) {
    this._model.setPlayerReady(isReady);
  }
}
