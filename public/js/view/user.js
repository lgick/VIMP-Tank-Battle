define(['Publisher'], function (Publisher) {
  // Singleton UserView
  var userView;

  function UserView(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._window = data.window;

    this._back = data.back;
    this._vimp = data.vimp;
    this._radar = data.radar;

    this._cmd = data.cmd;
    this._chat = data.chat;
    this._chatBox = data.chatBox;

    this._panel = data.panel;
    this._panelHealth = data.panelHealth;
    this._panelScore = data.panelScore;
    this._panelRank = data.panelRank;

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
    this._mPublic.on('health', 'updateHealth', this);
    this._mPublic.on('score', 'updateScore', this);
    this._mPublic.on('rank', 'updateRank', this);
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserView.prototype.init = function () {
    this._back.style.display = 'block';
    this._vimp.style.display = 'block';
    this._radar.style.display = 'block';
    this._chat.style.display = 'block';
    this._panel.style.display = 'block';
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

  // обновляет пользовательскую панель (здоровье)
  UserView.prototype.updateHealth = function (health) {
    this._panelHealth.innerHTML = health + '%';
  };

  // обновляет пользовательскую панель (счет)
  UserView.prototype.updateScore = function (score) {
    this._panelScore.innerHTML = score;
  };

  // обновляет пользовательскую панель (рейтинг)
  UserView.prototype.updateRank = function (rank) {
    this._panelRank.innerHTML = rank;
  };

  // изменение размеров
  UserView.prototype.resize = function (data) {
    if (data.vimp) {
      this._vimp.width = data.vimp.width;
      this._vimp.height = data.vimp.height;
    }

    if (data.back) {
      this._back.width = data.back.width;
      this._back.height = data.back.height;
    }

    if (data.radar) {
      this._radar.width = this._radar.height =
        data.radar.width;
    }
  };

  return UserView;
});
