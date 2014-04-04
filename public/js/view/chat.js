define(['Publisher'], function (Publisher) {
  // Singleton ChatView
  var chatView;

  function ChatView(model, data) {
    if (chatView) {
      return chatView;
    }

    chatView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._chat = data.chat;
    this._cmd = data.cmd;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('open', 'openCmd', this);
    this._mPublic.on('close', 'closeCmd', this);
    this._mPublic.on('newLine', 'createLine', this);
    this._mPublic.on('oldLine', 'removeLine', this);
    this._mPublic.on('newTimer', 'createTimer', this);
    this._mPublic.on('oldTimer', 'removeTimer', this);
  }

  // открывает командную строку
  ChatView.prototype.openCmd = function () {
    this._cmd.value = '';
    this._cmd.style.display = 'block';
    this._cmd.focus();
  };

  // закрывает командную строку
  ChatView.prototype.closeCmd = function (success) {
    if (success) {
      this.publisher.emit('message', this._cmd.value);
    }

    this._cmd.style.display = 'none';
    this._cmd.value = '';
  };

  // добавляет сообщение в чат-лист
  ChatView.prototype.createLine = function (data) {
    var line = this._document.createElement('div')
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
    var line = this._document.getElementById('line_' + id);

    line.style.opacity = 0;

    this._window.setTimeout(function () {
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
