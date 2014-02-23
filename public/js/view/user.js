define(['Publisher'], function (Publisher) {
  // Singleton UserView
  var userView;

  function UserView(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._window = data.window;
    this._modules = data.modules;
    this._panel = data.panel;

    this._cmd = data.cmd;
    this._chatBox = data.chatBox;

    this.publisher = new Publisher();

    this._window.onkeydown = function (event) {
      userView.publisher.emit('keyDown', {
        event: event,
        cmd: userView._cmd
      });
    };

    this._window.onkeyup = function (event) {
      userView.publisher.emit('keyUp', event);
    };

    this._window.onresize = function () {
      userView.publisher.emit('resize', {
        width: userView._window.innerWidth,
        height: userView._window.innerHeight
      });
    };

    this._mPublic = model.publisher;

    this._mPublic.on('mode', 'switchMode', this);
    this._mPublic.on('newLine', 'createLine', this);
    this._mPublic.on('oldLine', 'removeLine', this);
    this._mPublic.on('newTimer', 'createTimer', this);
    this._mPublic.on('oldTimer', 'removeTimer', this);
    this._mPublic.on('panel', 'updatePanel', this);
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserView.prototype.init = function () {
    var i = 0
      , len = this._modules.length;

    for (; i < len; i += 1) {
      this._modules[i].style.display = 'block';
    }
  };

  // переключает режим игры
  UserView.prototype.switchMode = function (mode) {
    if (mode === 'game') {
      this._cmd.style.display = 'none';
      this._cmd.value = '';
    }

    if (mode === 'cmd') {
      this._cmd.value = '';
      this._cmd.style.display = 'block';
      this._cmd.focus();
    }
  };

  // добавляет сообщение в чат-лист
  UserView.prototype.createLine = function (data) {
    var document = this._window.document
      , line = document.createElement('div')
      , id = data.id
      , message = data.message;

    line.id = 'line_' + id;
    line.className = 'line';
    line.setAttribute(
      'data-name', message.name + ': '
    );
    line.innerHTML = message.text;

    this._chatBox.appendChild(line);
  };

  // удаляет сообщение в чат-листе
  UserView.prototype.removeLine = function (id) {
    var w = this._window
      , line = w.document.getElementById('line_' + id);

    line.style.opacity = 0;

    w.setTimeout(function () {
      userView._chatBox.removeChild(line);
    }, 2000);
  };

  // устанавливает таймер
  UserView.prototype.createTimer = function (data) {
    var messageId = data.id
      , time = data.time
      , timerId;

    timerId = this._window.setTimeout(function () {
      userView.publisher.emit('oldTimer');
    }, time);

    userView.publisher.emit('newTimer', {
      messageId: messageId,
      timerId: timerId
    });
  };

  // снимает таймер
  UserView.prototype.removeTimer = function (timer) {
    this._window.clearTimeout(timer);
  };

  // обновляет пользовательскую панель
  UserView.prototype.updatePanel = function (data) {
    var elem = this._panel[data.name];

    if (elem) {
      elem.innerHTML = data.value;
    }
  };

  // изменение размеров
  UserView.prototype.resize = function (data) {
    var document = this._window.document
      , elem = document.getElementById(data.name);

    if (elem) {
      if (data.name === 'radar') {
        elem.width = elem.height = data.width;
      } else {
        elem.width = data.width;
        elem.height = data.height;
      }
    }
  };

  return UserView;
});
