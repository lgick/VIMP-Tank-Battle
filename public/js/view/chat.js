define(['Publisher'], function (Publisher) {
  // Singleton ChatView
  var chatView;

  function ChatView(model, data) {
    if (chatView) {
      return chatView;
    }

    chatView = this;

    this._window = data.window;
    this._chat = data.chat;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('newLine', 'createLine', this);
    this._mPublic.on('oldLine', 'removeLine', this);
    this._mPublic.on('newTimer', 'createTimer', this);
    this._mPublic.on('oldTimer', 'removeTimer', this);
  }

  // добавляет сообщение в чат-лист
  ChatView.prototype.createLine = function (data) {
    var document = this._window.document
      , line = document.createElement('div')
      , id = data.id
      , message = data.message;

    line.id = 'line_' + id;
    line.className = 'line';
    line.setAttribute('data-name', message.name + ': ');
    line.innerHTML = message.text;

    this._chat.appendChild(line);
  };

  // удаляет сообщение в чат-листе
  ChatView.prototype.removeLine = function (id) {
    var w = this._window
      , line = w.document.getElementById('line_' + id);

    line.style.opacity = 0;

    w.setTimeout(function () {
      chatView._chat.removeChild(line);
    }, 2000);
  };

  // устанавливает таймер
  ChatView.prototype.createTimer = function (data) {
    var messageId = data.id
      , time = data.time
      , timerId;

    timerId = this._window.setTimeout(function () {
      chatView.publisher.emit('oldTimer');
    }, time);

    chatView.publisher.emit('newTimer', {
      messageId: messageId,
      timerId: timerId
    });
  };

  // снимает таймер
  ChatView.prototype.removeTimer = function (timer) {
    this._window.clearTimeout(timer);
  };

  return ChatView;
});
