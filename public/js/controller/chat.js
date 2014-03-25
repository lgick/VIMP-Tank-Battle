define([], function () {
  // Singleton ChatCtrl
  var chatCtrl;

  function ChatCtrl(model, view) {
    if (chatCtrl) {
      return chatCtrl;
    }

    chatCtrl = this;

    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;

    this._vPublic.on('newTimer', 'createTimer', this);
    this._vPublic.on('oldTimer', 'removeTimer', this);
  }

  // добавляет сообщение
  ChatCtrl.prototype.add = function (message) {
    if (typeof message === 'object') {
      this._model.update(message);
    }
  };

  // добавляет таймер
  ChatCtrl.prototype.createTimer = function (data) {
    if (typeof data === 'object') {
      this._model.addToList(data);
    }
  };

  // удаляет таймер
  ChatCtrl.prototype.removeTimer = function () {
    this._model.removeFromList();
  };

  return ChatCtrl;
});
