define(['Publisher'], function (Publisher) {
  // Singleton UserModel
  var userModel;

  function UserModel(data) {
    if (userModel) {
      return userModel;
    }

    userModel = this;

    this._chatCacheMin = data.chatCacheMin;
    this._chatCacheMax = data.chatCacheMax;
    this._chatListLimit = data.chatListLimit;
    this._chatLineTime = data.chatLineTime;
    this._mode = data.mode;
    this._panel = data.panel;
    this._sizeRatio = data.sizeRatio;

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
    var i = 0
      , len = this._panel.length
      , name;

    for (; i < len; i += 1) {
      name = this._panel[i];

      if (data[name]) {
        this.publisher.emit('panel', {
          name: name,
          value: data[name]
        });
      }
    }
  };

  // рассчитывает размеры элементов с учетом пропорций
  UserModel.prototype.resize = function (data) {
    var width = data.width
      , height = data.height
      , ratio
      , p;

    for (p in this._sizeRatio) {
      if (this._sizeRatio.hasOwnProperty(p)) {
        ratio = this._sizeRatio[p];

        this.publisher.emit('resize', {
          name: p,
          width: Math.round(width * ratio),
          height: Math.round(height * ratio)
        });
      }
    }
  };

  return UserModel;
});
