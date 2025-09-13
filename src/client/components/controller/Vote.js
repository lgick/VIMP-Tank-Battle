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
  open(data) {
    // если данные - массив (данные голосования)
    if (Array.isArray(data)) {
      // если первый элемент массива null, значит это values
      if (data[0] === null) {
        this._model.updateValues(data[1]);
        // иначе создать голосование
      } else {
        this._model.createVote(data);
        this._model.open();
      }
      // если данные - строка (данные для шаблона)
    } else if (typeof data === 'string') {
      this._model.createWithTemplate(data);
      this._model.open();
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
  assignTimer(timerId) {
    this._model.assignTimer(timerId);
  }

  // удаляет голосование
  removeVote() {
    this._model.complete();
  }
}
