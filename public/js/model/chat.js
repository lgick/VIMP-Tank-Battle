define(['Publisher'], function (Publisher) {
  // Singleton ChatModel
  var chatModel;

  function ChatModel(data) {
    if (chatModel) {
      return chatModel;
    }

    chatModel = this;

    this._listLimit = data.listLimit || 5;
    this._lineTime = data.lineTime || 15000;
    this._cacheMin = data.cacheMin || 200;
    this._cacheMax = data.cacheMax || 300;

    this._cache = []; // хранилище сообщений
    this._list = [];  // активный чат-лист
    this._count = 0;  // id для сообщения чат-листа

    this.publisher = new Publisher();
  }

  // обновляет чат-лист
  ChatModel.prototype.update = function (message) {
    // если количество сообщений в хранилище достигло предела - удалить лишние
    if (this._cache.length === this._cacheMax) {
      this._cache.splice(0, this._cache.length - this._cacheMin);
    }

    // добавить объект сообщения в хранилище
    this._cache.push(message);

    // если количество выделенных линий исчерпано - удалить линию принудительно
    if (this._list.length === this._listLimit) {
      this.removeFromList(true);
    }

    this.publisher.emit('newLine', {
      id: this._count,
      message: message
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
