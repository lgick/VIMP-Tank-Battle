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
    this._String = this._window.String;
    this._Math = this._window.Math;

    this._chatCacheMin = data.chatCacheMin;
    this._chatCacheMax = data.chatCacheMax;
    this._chatListLimit = data.chatListLimit;
    this._chatLineTime = data.chatLineTime;
    this._sizeOptions = data.sizeOptions;
    this._socket = data.socket;
    this._ticker = data.ticker;

    this._chatCache = []; // хранилище сообщений
    this._chatList = [];  // активный чат-лист
    this._mode = null;    // режим (cmd: командный, menu: меню, stat: статистика)
    this._count = 0;      // id для сообщения чат-листа
    this._keySet = [];    // набор keyCode
    this._keys = [];      // массив состояния клавиш

    this.publisher = new Publisher();
  }

  // инициализация
  UserModel.prototype.init = function () {
    // запуск счетчика игры
    this._ticker.addEventListener('tick', this.sendKeys.bind(this));
  };

  // возвращает текущий режим
  UserModel.prototype.getMode = function () {
    return this._mode;
  };

  // обновляет режим
  UserModel.prototype.setMode = function (mode) {
    this._mode = mode;
    this.publisher.emit('mode', mode);
  };

  // обновляет набор состояния клавиш
  UserModel.prototype.updateKeysState = function (keyCode, press) {
    var i = 0
      , len = this._keySet.length;

    for (; i < len; i += 1) {
      if (this._keySet[i] === keyCode) {
        if (press) {
          this._keys[i] = 1;
        } else {
          this._keys[i] = 0;
        }
      }
    }
  };

  // очищает список команд
  UserModel.prototype.clearKeys = function () {
    var i = 0
      , len = this._keys.length;

    for (; i < len; i += 1) {
      this._keys[i] = 0;
    }
  };

  // отправляет информацию о клавишах на сервер
  UserModel.prototype.sendKeys = function () {
    var str = this._keys.join('');

    // если в строке НЕ все нули
    if (~~str) {
      // первое число не должно быть 0
      str = '1' + str;

      // отправка данных в системе счисления base36
      this._socket.emit('cmds', this._parseInt(str, 2).toString(36));
    }
  };

  // добавляет сообщение
  UserModel.prototype.addMessage = function (message) {
    // если количество сообщений в хранилище достигло предела - удалить лишние
    if (this._chatCache.length === this._chatCacheMax) {
      this._chatCache.splice(0, this._chatCache.length - this._chatCacheMin);
    }

    // добавить объект сообщения в хранилище
    this._chatCache.push(message);

    // если количество выделенных линий исчерпано - удалить линию принудительно
    if (this._chatList.length === this._chatListLimit) {
      this.removeFromList(true);
    }

    this.publisher.emit('newLine', {
      id: this._count,
      message: message
    });

    this.publisher.emit('newTimer', {
      id: this._count,
      time: this._chatLineTime
    });

    this._count += 1;
  };

  // добавляет объект в чат-лист
  UserModel.prototype.addToList = function (data) {
    this._chatList.push(data);
  };

  // удаляет объект из чат-листа
  UserModel.prototype.removeFromList = function (sync) {
    var data = this._chatList.shift();

    this.publisher.emit('oldLine', data.messageId);

    if (sync) {
      this.publisher.emit('oldTimer', data.timerId);
    }
  };

  // отправляет сообщение
  UserModel.prototype.sendMessage = function (message) {
    this._socket.emit('chat', message);
  };

  // отправляет данные меню
  UserModel.prototype.sendMenuData = function (keyCode) {
    if (48 <= keyCode && keyCode <= 57) {
      var symbol = this._String.fromCharCode(keyCode);
      symbol = this._parseInt(symbol, 10);

      this._socket.emit('menu', symbol, this.menuResponse.bind(this));
    }
  };

  // получает данные меню с сервера
  UserModel.prototype.menuResponse = function (data) {
    // если ответ пустой, закрыть меню
    if (!data) {
      this.setMode(null);
    // иначе, отобразить результаты меню пользователю
    } else {
      // TODO: преобразовать и передать на view
    }
  };

  // обновляет данные клавиш
  UserModel.prototype.updateKeys = function (data) {
    var i = 0
      , len = data.length;

    this._keySet = data;
    this._keys.length = data.length;

    for (; i < len; i += 1) {
      this._keys[i] = 0;
    }
  };

  // обновляет данные панели пользователя
  UserModel.prototype.updatePanel = function (data) {
    var name;

    for (name in data) {
      if (data.hasOwnProperty(name)) {
        this.publisher.emit('panel', {name: name, value: data[name]});
      }
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
