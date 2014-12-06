define(['Publisher'], function (Publisher) {
  // Singleton ChatModel
  var chatModel;

  function ChatModel(data) {
    if (chatModel) {
      return chatModel;
    }

    chatModel = this;

    this._window = data.window;
    this._RegExp = this._window.RegExp;

    this._listLimit = data.listLimit || 5;
    this._lineTime = data.lineTime || 15000;
    this._cacheMin = data.cacheMin || 200;
    this._cacheMax = data.cacheMax || 300;
    this._messageList = data.messageList || [];

    this._cache = []; // хранилище сообщений
    this._list = [];  // активный чат-лист
    this._count = 0;  // id для сообщения чат-листа

    this.publisher = new Publisher();
  }

  // открывает cmd
  ChatModel.prototype.open = function () {
    this.publisher.emit('open');

    this.publisher.emit('mode', {
      name: 'chat',
      status: 'opened'
    });
  };

  // закрывает cmd
  ChatModel.prototype.close = function (success) {
    if (success) {
      this.publisher.emit('close', true);
    } else {
      this.publisher.emit('close', false);
    }

    this.publisher.emit('mode', {
      name: 'chat',
      status: 'closed'
    });
  };

  // отправляет сообщение на сервер
  ChatModel.prototype.sendMessage = function (message) {
    message = message.replace(/<|\>|\"|\'|\%|\;|\(|\)|\&|\+|\-/g, '');

    if (message) {
      this.publisher.emit('socket', message);
    }
  };

  // обновляет чат-лист
  ChatModel.prototype.updateChat = function (arr) {
    var message
      , dataArr
      , regExp
      , i
      , len
    ;

    // если первый элемент число
    if (typeof arr[0] === 'number') {
      message = this._messageList[arr[0]];
      dataArr = arr[1];

      // если сообщение не найдено
      if (!message) {
        return;
      }

      // если есть массив с данными
      if (dataArr) {
        for (i = 0, len = dataArr.length; i < len; i += 1) {
          regExp = new this._RegExp('\\{' + i + '\\}', 'g');
          message = message.replace(regExp, dataArr[i]);
        }
      }

      arr = [message];
    }

    // если количество сообщений в хранилище достигло предела -
    // удалить лишние
    if (this._cache.length === this._cacheMax) {
      this._cache.splice(0, this._cache.length - this._cacheMin);
    }

    // добавить объект сообщения в хранилище
    this._cache.push(arr);

    // если количество выделенных линий исчерпано -
    // удалить линию принудительно
    if (this._list.length === this._listLimit) {
      this.removeFromList(true);
    }

    this.publisher.emit('newLine', {
      id: this._count,
      message: arr
    });

    this.publisher.emit('newTimer', {
      id: this._count,
      time: this._lineTime
    });

    this._count += 1;
  };

  // добавляет объект в чат-лист
  ChatModel.prototype.addToList = function (data) {
    this._list.push(data);
  };

  // удаляет объект из чат-листа
  ChatModel.prototype.removeFromList = function (sync) {
    var data = this._list.shift();

    this.publisher.emit('oldLine', data.messageId);

    if (sync) {
      this.publisher.emit('oldTimer', data.timerId);
    }
  };

  return ChatModel;
});
