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

    this._vPublic = view.publisher;

    this._vPublic.on('keyDown', 'add', this);
    this._vPublic.on('keyUp', 'remove', this);
    this._vPublic.on('newTimer', 'createTimer', this);
    this._vPublic.on('oldTimer', 'removeTimer', this);
    this._vPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserCtrl.prototype.init = function (data) {
    this.updateKeys(data.keys);
    this.updatePanel(data.panel);
    this.resize(data.size);

    this._model.init();
    this._view.init();
  };

  // добавляет команду
  UserCtrl.prototype.add = function (data) {
    var event = data.event
      , cmd = data.cmd
      , mode = this._model.getMode()
      , key = this.parseKeyCode(event.keyCode, mode);

    // если включен режим игры
    if (mode === 'game') {
      if (key === 'cmd') {
        event.preventDefault();
        this._model.switchMode(key);
        this._model.clearGameKey();
        return;
      }

      this._model.addGameKey(key);
    }

    // если включен командный режим
    if (mode === 'cmd') {
      if (key === 'game') {
        this._model.switchMode(key);
        return;
      }

      if (key === 'enter') {
        // тест для сообщений
        if (cmd.value) {
          this._model.sendMessage(cmd.value);
        }

        this._model.switchMode('game');
        return;
      }
    }
  };

  // удаляет команду
  UserCtrl.prototype.remove = function (event) {
    var keyCode = event.keyCode
      , mode = this._model.getMode()
      , key = this.parseKeyCode(keyCode, mode);

    if (mode === 'game') {
      this._model.removeGameKey(key);
    }
  };

  // преобразует клавишу в команду
  UserCtrl.prototype.parseKeyCode = function (
    keyCode, mode
  ) {
    var keys = this._keys[mode]
        // преобразование в строку
      , key = keyCode.toString()
      , p;

    for (p in keys) {
      if (keys.hasOwnProperty(p)) {
        if (p === key) {
          return keys[p];
        }
      }
    }
  };

  // обновляет чат-лист
  UserCtrl.prototype.updateChat = function (message) {
    if (typeof message === 'object') {
      this._model.addMessage(message);
    }
  };

  // добавляет таймер
  UserCtrl.prototype.createTimer = function (data) {
    if (typeof data === 'object') {
      this._model.addToList(data);
    }
  };

  // удаляет таймер
  UserCtrl.prototype.removeTimer = function () {
    this._model.removeFromList();
  };

  // обновляет пользовательскую панель
  UserCtrl.prototype.updatePanel = function (data) {
    if (typeof data === 'object') {
      this._model.updatePanel(data);
    }
  };

  // обновляет набор клавиша-команда
  UserCtrl.prototype.updateKeys = function (keyData) {
    if (typeof keyData === 'object') {
      this._keys = keyData;
    }
  };

  // обновляет размеры
  UserCtrl.prototype.resize = function (data) {
    this._model.resize(data);
  };

  return UserCtrl;
});
