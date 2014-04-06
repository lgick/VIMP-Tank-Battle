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

    this._defaultVote = data.vote;  // голосование по умолчанию
    this._currentVote = null;       // текущее голосование
    this._typeVote = null;          // тип объекта голосования (объект или массив)

    this._voteName = null;          // название голосования
    this._data = {};                // данные голосования

    this._title = null;             // заголовок голосования
    this._back = false;             // флаг back
    this._more = false;             // флаг more
    this._values = [];              // значения голосованиях
    this._currentPage = 0;          // текущая страница вывода значений

    this.publisher = new Publisher();
  }

  // открывает голосование
  VoteModel.prototype.open = function () {
    this.publisher.emit('mode', {
      name: 'vote',
      status: 'opened'
    });
  };

  // создает голосование
  VoteModel.prototype.createVote = function (voteData) {
    var i
      , len
      , vote = this._currentVote = voteData || this._defaultVote;

    this._title = null;
    this._values = [];
    this._currentPage = 0;
    this._back = false;
    this._more = false;

    // определение типа
    if (this._Object.prototype.toString.call(vote) === '[object Array]') {
      this._typeVote = 'array';
    } else if (this._Object.prototype.toString.call(vote) === '[object Object]') {
      this._typeVote = 'object';
    } else {
      this._typeVote = null;
    }

    // если тип данных для голосования - массив
    if (this._typeVote === 'array') {
      this._title = 'Menu';

      for (i = 0, len = vote.length; i < len; i += 1) {
        this._values.push(vote[i].title);
      }

      this.show();

    // иначе, если тип данных для голосования - объект
    } else if (this._typeVote === 'object') {
      this._title = vote.title;

      if (typeof vote.value === 'string') {
        this._socket.emit('vote', vote.value, (function (values) {
          this._values = values;
          this.show();
        }).bind(this));
      } else {
        this._values = vote.value;
        this.show();
      }
    }
  };

  // обновляет голосование
  VoteModel.prototype.update = function (keyCode) {
    var number;

    // если keyCode это число от 0 до 9
    if (48 <= keyCode && keyCode <= 57) {
      number = this._String.fromCharCode(keyCode);
      number = this._parseInt(number, 10);

      // exit
      if (number === 0) {
        this.complete();

      // back
      } else if (number === 8) {
        if (this._back) {
          this._currentPage -= 1;
          this.show();
        }

      // more
      } else if (number === 9) {
        if (this._more) {
          this._currentPage += 1;
          this.show();
        }

      // иначе, число от 1 до 7
      } else {
        number = number - 1;

        // если тип данных для голосования это массив
        if (this._typeVote === 'array') {
          // если число есть в массиве значений
          if (this._currentVote[number]) {
            this.createVote(this._currentVote[number]);
          }

        // иначе, если тип данных для голосования это объект
        } else if (this._typeVote === 'object') {
          // если число есть в массиве значений
          if (this._currentVote.value[number]) {

            // если у голосования есть название
            if (this._currentVote.vote) {
              this._voteName = this._currentVote.vote;
            }

            this._data[this._currentVote.key] = this._values[number];

            // если есть вложенный опрос, то создаем новое голосование
            if (this._currentVote.next) {
              this.createVote(this._currentVote.next);

            // иначе, отправляет результат на сервер и завершаем голосование
            } else {
              this._socket.emit('vote', {
                vote: this._voteName,
                data: this._data
              });

              this.complete();
            }
          }
        }
      }
    }
  };

  // отображает голосование
  VoteModel.prototype.show = function () {
    var begin = this._currentPage * 7
      , max = begin + 7
      , values = this._values.slice(begin, max);

    if (this._currentPage > 0) {
      this._back = true;
    } else {
      this._back = false;
    }

    if (this._values.length > max) {
      this._more = true;
    } else {
      this._more = false;
    }

    this.publisher.emit('clear');

    this.publisher.emit('vote', {
      title: this._title,
      list: values,
      back: this._back,
      more: this._more
    });
  };

  // завершает голосование
  VoteModel.prototype.complete = function () {
    this._data = {};
    this.publisher.emit('clear');
    this.publisher.emit('mode', {
      name: 'vote',
      status: 'closed'
    });
  };

  return VoteModel;
});
