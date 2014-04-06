define([], function () {
  // Singleton VoteCtrl
  var voteCtrl;

  function VoteCtrl(model, view) {
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
  VoteCtrl.prototype.open = function (vote) {
    if (vote) {
      this._model.createVote(vote);
    } else {
      this._model.createVote();
    }

    this._model.open();
  };

  // назначает ключ
  VoteCtrl.prototype.assignKey = function (keyCode) {
    this._model.update(keyCode);
  };

  // добавляет таймер
  VoteCtrl.prototype.assignTimer = function (timerID) {
    this._model.assignTimer(timerID);
  };

  // удаляет голосование
  VoteCtrl.prototype.removeVote = function () {
    this._model.complete();
  };

  return VoteCtrl;
});
