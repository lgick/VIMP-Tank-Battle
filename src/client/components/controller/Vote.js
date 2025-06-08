// Singleton VoteCtrl

let voteCtrl;

export default class VoteCtrl {
  constructor(model, view) {
    if (voteCtrl) {
      return voteCtrl;
    }

    voteCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;

    this._vPublic.on('timer', 'assignTimer', this);
    this._vPublic.on('clear', 'removeVote', this);
  }

  // включить
  open(dataArray) {
    // если есть данные
    if (dataArray) {
      // если первый элемент массива null, значит это values
      if (dataArray[0] === null) {
        this._model.updateValues(dataArray[1]);
        // иначе создать голосование
      } else {
        this._model.createVote(dataArray);
        this._model.open();
      }
      // иначе открыть меню
    } else {
      this._model.createMenu();
      this._model.open();
    }
  }

  // назначает ключ
  assignKey(keyCode) {
    this._model.update(keyCode);
  }

  // добавляет таймер
  assignTimer(timerID) {
    this._model.assignTimer(timerID);
  }

  // удаляет голосование
  removeVote() {
    this._model.complete();
  }
}
