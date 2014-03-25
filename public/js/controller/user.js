define([], function () {
  // Singleton UserCtrl
  var userCtrl;

  function UserCtrl(model, view) {
    if (userCtrl) {
      return userCtrl;
    }

    userCtrl = this;

    this._model = model;
    this._view = view;

    this._cmds = {};

    this._vPublic = view.publisher;

    this._vPublic.on('keyDown', 'add', this);
    this._vPublic.on('keyUp', 'remove', this);
    this._vPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserCtrl.prototype.init = function (data) {
    this.updateKeys(data.keys);
    this.resize(data.size);

    this._model.init();
    this._view.init();
  };

  // добавляет команду
  UserCtrl.prototype.add = function (data) {
    var event = data.event
      , keyCode = event.keyCode
      , input = data.cmd
      , cmd = this.parseKeyCode(keyCode)
      , mode = this._model.getMode();

    // если режим не задан
    if (!mode) {
      // если не команда
      if (!cmd) {
        this._model.updateKeysState(keyCode, true);
      // иначе, если команда включения режима - включить
      } else if (cmd === 'stat' || cmd === 'cmd' || cmd === 'menu') {
        event.preventDefault();
        this._model.setMode(cmd);
        this._model.clearKeys();
      }

    // иначе, если команда esc - сбросить режим
    } else if (cmd === 'esc') {
      this._model.setMode(null);

    // иначе...
    } else {

      // если клавиша tab - отмена действия по умолчанию
      if (cmd === 'stat') {
        event.preventDefault();
      }

      // если текущий режим cmd
      if (mode === 'cmd') {
        if (cmd === 'enter') {
          if (input.value) {
            this._model.sendMessage(input.value);
          }
          this._model.setMode(null);
        }
      }

      // если текущий режим menu
      if (mode === 'menu') {
        this._model.sendMenuData(keyCode);
      }
    }
  };

  // удаляет команду
  UserCtrl.prototype.remove = function (event) {
    var keyCode = event.keyCode
      , cmd = this.parseKeyCode(keyCode)
      , mode = this._model.getMode();

    if (!mode) {
      this._model.updateKeysState(keyCode, false);
    } else {
      if (mode === 'stat') {
        if (cmd === 'stat') {
          this._model.setMode(null);
        }
      }
    }
  };

  // преобразует клавишу в команду
  UserCtrl.prototype.parseKeyCode = function (keyCode) {
    var key = keyCode.toString()
      , p;

    for (p in this._cmds) {
      if (this._cmds.hasOwnProperty(p)) {
        if (p === key) {
          return this._cmds[p];
        }
      }
    }
  };

  // обновляет набор клавиш-команд
  UserCtrl.prototype.updateKeys = function (data) {
    if (typeof data === 'object') {
      this._cmds = data.cmds;
      this._model.updateKeys(data.keys);
    }
  };

  // обновляет размеры
  UserCtrl.prototype.resize = function (data) {
    this._model.resize(data);
  };

  return UserCtrl;
});
