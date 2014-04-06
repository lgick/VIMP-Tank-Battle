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

  return VoteCtrl;
});
