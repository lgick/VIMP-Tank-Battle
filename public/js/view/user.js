define(['Publisher'], function (Publisher) {
  // Singleton UserView
  var userView;

  function UserView(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._window = data.window;
    this._displayID = data.displayID;

    this._cmd = data.cmd;
    this._stat = data.stat;
    this._menu = data.menu;

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
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserView.prototype.init = function () {
    var i = 0
      , len = this._displayID.length
      , document = this._window.document
      , elem;

    for (; i < len; i += 1) {
      elem = document.getElementById(this._displayID[i]);
      elem.style.display = 'block';
    }
  };

  // переключает режим
  UserView.prototype.switchMode = function (mode) {
    if (mode === 'cmd') {
      this._cmd.value = '';
      this._cmd.style.display = 'block';
      this._cmd.focus();
    } else if (mode === 'stat') {
      this._stat.style.display = 'block';
    } else if (mode === 'menu') {
      this._menu.style.display = 'block';
    } else {
      this._cmd.style.display = 'none';
      this._cmd.value = '';
      this._stat.style.display = 'none';
      this._menu.style.display = 'none';
    }
  };

  // изменение размеров
  UserView.prototype.resize = function (sizes) {
    var document = this._window.document
      , id
      , elem;

    for (id in sizes) {
      if (sizes.hasOwnProperty(id)) {
        elem = document.getElementById(id);

        if (elem) {
          elem.style.width = sizes[id].width + 'px';
          elem.style.height = sizes[id].height + 'px';
        }
      }
    }

    this.publisher.emit('redraw', sizes);
  };

  return UserView;
});
