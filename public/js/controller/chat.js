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
    this._vPublic.on('message', 'sendMessage', this);
  }

  // открывает cmd
  ChatCtrl.prototype.open = function () {
    this._model.open();
  };

  // обновление состояния cmd по команде
  ChatCtrl.prototype.updateCmd = function (cmd) {
    if (cmd === 'enter') {
      this._model.close(true);
    } else if (cmd === 'escape') {
      this._model.close(false);
    }
  };

  // отправляет сообщение
  ChatCtrl.prototype.sendMessage = function (message) {
    if (typeof message === 'string') {
      this._model.sendMessage(message);
    }
  };

  // добавляет сообщение
  ChatCtrl.prototype.add = function (message) {
    if (typeof message === 'object') {
      this._model.updateChat(message);
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
