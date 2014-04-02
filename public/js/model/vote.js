define(['Publisher'], function (Publisher) {
  // Singleton VoteModel
  var voteModel;

  function VoteModel(data) {
    if (voteModel) {
      return voteModel;
    }

    voteModel = this;

    this._window = data.window;
    this._Object = this._window.Object;
    this._String = this._window.String;
    this._parseInt = this._window.parseInt;

    this._socket = data.socket;

    this._defaultVote = data.vote;
    this._currentVote = null;
    this._data = {};
    this._type = null;

    this.publisher = new Publisher();
  }

  // разбирает keyCode
  VoteModel.prototype.parseKey = function (keyCode) {
    var symbol;

    // если keyCode это число от 0 до 9
    if (48 <= keyCode && keyCode <= 57) {
      symbol = this._String.fromCharCode(keyCode);
      symbol = this._parseInt(symbol, 10);

      console.log(symbol);
      if (symbol === 0) {
        this.complete();
      } else {
        this.update(symbol);
      }
    }
  };

  // определяет тип
  VoteModel.prototype.defineTypeVoteData = function (vote) {
    var v = vote || this._currentVote;

    if (this._Object.prototype.toString.call(v) === '[object Array]') {
      this._type = 'array';
    } else if (this._Object.prototype.toString.call(v) === '[object Object]') {
      this._type = 'object';
    } else {
      this._type = null;
    }
  };

  // разбирает данные для view
  VoteModel.prototype.createVote = function (vote) {
    var i
      , len
      , title
      , arr
      , list = [];

    this._currentVote = vote || this._defaultVote;

    this.defineTypeVoteData();

    if (this._type === 'array') {
      title = 'Vote';
      arr = this._currentVote;

      for (i = 0, len = arr.length; i < len; i += 1) {
        list.push(arr[i].title);
      }
    } else if (this._type === 'object') {
      title = this._currentVote.title;
      arr = this._currentVote.value;

      for (i = 0, len = arr.length; i < len; i += 1) {
        list.push(arr[i]);
      }
    }

    this.publisher.emit('clear');

    this.publisher.emit('vote', {
      title: title,
      list: list
    });
  };

  // обновляет голосование
  VoteModel.prototype.update = function (number) {
    var number = number - 1;

    if (this._type === 'array' && this._currentVote[number]) {
      this.createVote(this._currentVote[number]);
    } else if (this._type === 'object' && this._currentVote.value[number]) {
      this._data[this._currentVote.key] = this._currentVote.value[number];

      // если есть вложенный опрос
      if (this._currentVote.next) {
        this.createVote(this._currentVote.next);
      } else {
        this._socket.emit('vote', this._data);
        this.complete();
      }
    }
  };

  // удаляет голосование
  VoteModel.prototype.remove = function () {
    this._data = {};
    this.publisher.emit('clear');
  };

  // завершает голосование
  VoteModel.prototype.complete = function () {
    this.publisher.emit('complete');
  };

  return VoteModel;
});
