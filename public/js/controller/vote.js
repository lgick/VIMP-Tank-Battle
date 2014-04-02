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
  }

  // включить
  VoteCtrl.prototype.on = function (vote) {
    if (vote) {
      this._model.createVote(vote);
    } else {
      this._model.createVote();
    }
  };

  // выключить
  VoteCtrl.prototype.off = function () {
    this._model.remove();
  };

  // обновление данных
  VoteCtrl.prototype.update = function (keyCode) {
    this._model.parseKey(keyCode);
  };

  return VoteCtrl;
});
