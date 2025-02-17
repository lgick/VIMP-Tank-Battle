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
    this._messages = data.messages || {};
    this._messageExp = new this._RegExp(data.messageExp, 'g');

    this._cache = [];   // хранилище сообщений
    this._list = [];    // активный чат-лист
    this._counter = 0;  // id для сообщения чат-листа

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
    message = message.replace(this._messageExp, '');

    if (message) {
      this.publisher.emit('socket', message);
    }
  };

  // обновляет чат-лист. Данные могут быть 2-х видов:
  // - в виде строки '<группа шаблонов>:<номер шаблона>:<параметры>'
  // - в виде массива [<текст сообщения>,<имя автора>,<тип для класса>]
  ChatModel.prototype.updateChat = function (arr) {
    var message
      , params
      , regExp
      , i
      , len
    ;

    // если данные - строка
    if (typeof arr === 'string') {
      arr = arr.split(':');

      // если сообщений не найдено
      if (!this._messages[arr[0]] || !this._messages[arr[0]][arr[1]]) {
        return;
      }

      message = this._messages[arr[0]][arr[1]];

      params = arr[2];

      // если есть параметры
      if (params) {
        params = params.split(',');

        for (i = 0, len = params.length; i < len; i += 1) {
          regExp = new this._RegExp('\\{' + i + '\\}', 'g');
          message = message.replace(regExp, params[i]);
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
      id: this._counter,
      message: arr
    });

    this.publisher.emit('newTimer', {
      id: this._counter,
      time: this._lineTime
    });

    this._counter += 1;
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
