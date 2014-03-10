define(['Publisher'], function (Publisher) {
  // Singleton UserModel
  var userModel;

  function UserModel(data) {
    if (userModel) {
      return userModel;
    }

    userModel = this;

    this._window = data.window;
    this._chatCacheMin = data.chatCacheMin;
    this._chatCacheMax = data.chatCacheMax;
    this._chatListLimit = data.chatListLimit;
    this._chatLineTime = data.chatLineTime;
    this._mode = data.mode;
    this._sizeOptions = data.sizeOptions;
    this._socket = data.socket;
    this._ticker = data.ticker;

    this._chatCache = []; // хранилище сообщений
    this._chatList = [];  // активный чат-лист
    this._count = 0;      // id для сообщения чат-листа
    this._keys = [];      // текущие команды в игре
    this._noKeys = false; // флаг отправки пустых команд

    this.publisher = new Publisher();
  }

  // инициализация
  UserModel.prototype.init = function () {
    var that = this;

    // запуск счетчика игры
    this._ticker.addEventListener('tick', function () {
      that.sendKeys();
    });
  };

  // возвращает текущий режим
  UserModel.prototype.getMode = function () {
    return this._mode;
  };

  // обновляет режим
  UserModel.prototype.switchMode = function (mode) {
    this._mode = mode;
    this.publisher.emit('mode', mode);
  };

  // добавляет команду
  UserModel.prototype.addGameKey = function (key) {
    var index = this._keys.indexOf(key);

    if (!key || index !== -1) {
      return;
    }

    this._keys.push(key);
  };

  // удаляет команду
  UserModel.prototype.removeGameKey = function (key) {
    var index = this._keys.indexOf(key);

    if (!key || index === -1) {
      return;
    }

    this._keys.splice(index, 1);
  };

  // очищает список команд
  UserModel.prototype.clearGameKey = function () {
    this._keys = [];
  };

  // отправляет список команд на сервер
  // Если данных нет, то на сервер поступает
  // пустой массив (но только 1 раз!)
  UserModel.prototype.sendKeys = function () {
    // если массив команд не пуст
    if (this._keys.length !== 0) {
      this._socket.emit('cmds', this._keys);
      this._noKeys = false;
    // иначе, если флаг неактивен,
    // отправить пустой массив команд
    } else if (this._noKeys === false) {
      this._socket.emit('cmds', this._keys);
      this._noKeys = true;
    }
  };

  // добавляет сообщение
  UserModel.prototype.addMessage = function (message) {
    // если количество сообщений в хранилище
    // достигло предела - удалить лишние
    if (this._chatCache.length === this._chatCacheMax) {
      this._chatCache.splice(
        0, this._chatCache.length - this._chatCacheMin
      );
    }

    // добавить объект сообщения в хранилище
    this._chatCache.push(message);

    // если количество выделенных линий исчерпано -
    // удалить линию принудительно
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
      , Math = this._window.Math
      , parseInt = this._window.parseInt
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
          widthRatio = parseInt(aspectRatio[0], 10);
          heightRatio = parseInt(aspectRatio[1], 10);

          width = Math.round(screenWidth * screenRatio);
          height = width / widthRatio * heightRatio;

          // если фактическая высота больше полученной,
          // то вычисления производятся относительно высоты
          if (height > screenHeight) {
            height = Math.round(screenHeight * screenRatio);
            width = height / heightRatio * widthRatio;
          }
        } else {
          width = Math.round(screenWidth * screenRatio);
          height = Math.round(screenHeight * screenRatio);
        }

        width = +(width).toFixed();
        height = +(height).toFixed();

        // четные размеры для устранения искажений
        if (width % 2) {
          width -= 1;
        }

        if (height % 2) {
          height -= 1;
        }

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
