define(['Publisher'], function (Publisher) {
  // Singleton UserModel
  var userModel;

  function UserModel(data) {
    if (userModel) {
      return userModel;
    }

    userModel = this;

    this._window = data.window;

    this._parseInt = this._window.parseInt;
    this._Math = this._window.Math;

    this._sizeOptions = data.sizeOptions;

    this._keySet = data.keys.keySet;
    this._modes = data.keys.modes;
    this._cmds = data.keys.cmds;

    this._ticker = data.ticker;

    this._currentModes = {};  // статусы режимов
    this._keys = 0;           // состояние клавиш

    this.publisher = new Publisher();
  }

  // инициализация
  UserModel.prototype.init = function () {
    // запуск счетчика игры
    this._ticker.addEventListener('tick', this.sendKeys.bind(this));

    this.publisher.emit('init');
  };

  // добавляет команду
  UserModel.prototype.addKey = function (event) {
    var keyCode = event.keyCode
      , mode = this._modes[keyCode]
      , cmd = this._cmds[keyCode];

    // если чат активен
    if (this._currentModes.chat) {
      if (cmd) {
        this.publisher.emit('chat', cmd);
      }

      if (mode === 'stat') {
        event.preventDefault();
        this.publisher.emit('mode', mode);
      }
    } else {
      this.updateKeysState(keyCode, true);

      if (this._currentModes.vote) {
        this.publisher.emit('vote', keyCode);
      }

      if (this._currentModes.stat) {
        event.preventDefault();
      }

      if (mode) {
        event.preventDefault();
        this.publisher.emit('mode', mode);
      }
    }
  };

  // удаляет команду
  UserModel.prototype.removeKey = function (event) {
    var keyCode = event.keyCode
      , mode = this._modes[keyCode];

    this.updateKeysState(keyCode, false);

    if (this._currentModes.stat) {
      if (mode === 'stat') {
        this.publisher.emit('stat');
      }
    }
  };

  // меняет состояние режима
  UserModel.prototype.setMode = function (mode, status) {
    if (status === 'opened') {
      this._currentModes[mode] = true;
    } else if (status === 'closed') {
      this._currentModes[mode] = false;
    }
  };

  // обновляет набор состояния клавиш
  UserModel.prototype.updateKeysState = function (keyCode, press) {
    var key = this._keySet[keyCode];

    if (key) {
      if (press) {
        this._keys = this._keys | key;
      } else {
        this._keys = this._keys & ~ key;
      }
    }
  };

  // отправляет информацию о клавишах на сервер
  UserModel.prototype.sendKeys = function () {
    // если есть команды, то отправка данных
    if (this._keys !== 0) {
      this.publisher.emit('socket', this._keys);
    }
  };

  // рассчитывает размеры элементов с учетом пропорций
  UserModel.prototype.resize = function (data) {
    var screenWidth = data.width
      , screenHeight = data.height
      , sizes = {}
      , screenRatio
      , aspectRatio
      , widthRatio
      , heightRatio
      , width
      , height
      , p;

    for (p in this._sizeOptions) {
      if (this._sizeOptions.hasOwnProperty(p)) {
        screenRatio = this._sizeOptions[p].screenRatio || 1;
        aspectRatio = this._sizeOptions[p].aspectRatio;

        // если задано соотношение сторон
        if (aspectRatio) {
          aspectRatio = aspectRatio.split(':');

          // строку в число
          widthRatio = this._parseInt(aspectRatio[0], 10);
          heightRatio = this._parseInt(aspectRatio[1], 10);

          width = this._Math.round(screenWidth * screenRatio);
          height = width / widthRatio * heightRatio;

          // если фактическая высота больше полученной,
          // то вычисления производятся относительно высоты
          if (height > screenHeight) {
            height = this._Math.round(screenHeight * screenRatio);
            width = height / heightRatio * widthRatio;
          }
        } else {
          width = this._Math.round(screenWidth * screenRatio);
          height = this._Math.round(screenHeight * screenRatio);
        }

        width = +(width).toFixed();
        height = +(height).toFixed();

        sizes[p] = {
          width: width,
          height: height,
        };
      }
    }

    this.publisher.emit('resize', sizes);
  };

  return UserModel;
});
