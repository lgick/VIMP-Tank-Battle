import Publisher from '../../../lib/Publisher.js';

// Singleton VoteModel

let voteModel;

export default class VoteModel {
  constructor(data) {
    if (voteModel) {
      return voteModel;
    }

    voteModel = this;

    this._window = data.window;
    this._String = this._window.String;
    this._parseInt = this._window.parseInt;

    this._menu = data.menu; // меню

    this._currentVote = null; // текущее голосование
    this._type = ''; // тип ('menu', 'vote')
    this._waitingValues = false; // ожидания значений

    this._time = data.time || 10000; // время жизни голосования
    this._timerId = null; // id таймера

    this._timeOff = false; // флаг отключения времени жизни голосования

    this._voteName = ''; // название голосования
    this._data = []; // данные голосования

    this._title = null; // заголовок голосования
    this._values = []; // все значения голосования

    this._back = false; // флаг back
    this._more = false; // флаг more
    this._currentPage = 0; // текущая страница вывода значений
    this._currentValues = []; // значения текущей страницы

    this.publisher = new Publisher();
  }

  // открывает голосование
  open() {
    this.publisher.emit('mode', { name: 'vote', status: 'opened' });
  }

  // создает голосование
  createVote(data) {
    if (this._waitingValues) {
      return;
    }

    this._type = 'vote';
    this._back = false;
    this._more = false;
    this._currentPage = 0;

    // если данные имеют вид:
    // [[name:string, timeOff: boolean], [title: string, value: array, next: array || null]]
    if (data.length === 2) {
      this._voteName = data[0][0];
      this._timeOff = data[0][1] ? true : false;

      this._currentVote = data[1];

      // если данные: ['title', 'value', 'next']
    } else if (data.length === 3) {
      this._currentVote = data;
    }

    this._title = this._currentVote[0];

    const values = this._currentVote[1];

    if (typeof values === 'string') {
      this._waitingValues = true;
      this.publisher.emit('socket', values);
    } else {
      this._values = values;
      this.show();
    }
  }

  // создает меню
  createMenu() {
    if (this._waitingValues) {
      return;
    }

    this._currentVote = this._menu;
    this._timeOff = false;

    this._type = 'menu';
    this._back = false;
    this._more = false;
    this._currentPage = 0;

    this._data = [];
    this._title = 'Menu';
    this._values = [];
    this._voteName = '';

    for (let i = 0, len = this._currentVote.length; i < len; i += 1) {
      this._values.push(this._currentVote[i][1][0]);
    }

    this.show();
  }

  // обновляет массив значений
  updateValues(values) {
    if (this._waitingValues) {
      this._values = values;
      this._waitingValues = false;
      this.show();
    }
  }

  // обновляет голосование
  update(keyCode) {
    let number, value;

    if (this._waitingValues) {
      return;
    }

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
        if (this._type === 'menu') {
          // если число есть в массиве значений
          if (this._currentVote[number]) {
            this.createVote(this._currentVote[number]);
          }

          // иначе, если тип данных для голосования это объект
        } else if (this._type === 'vote') {
          // если число есть в массиве значений
          if (this._currentValues[number]) {
            value = this._currentValues[number].split(':');
            value = value.length === 2 ? value[1] : value[0];

            this._data.push(value);

            // если есть вложенный опрос, то создаем новое голосование
            if (this._currentVote[2]) {
              this.createVote(this._currentVote[2]);

              // иначе, отправляет результат на сервер и завершаем голосование
            } else {
              this.publisher.emit('socket', [this._voteName, this._data]);
              this.complete();
            }
          }
        }
      }
    }
  }

  // отображает голосование
  show() {
    const begin = this._currentPage * 7;
    const max = begin + 7;
    let currentValues = [];

    this._currentValues = this._values.slice(begin, max);
    this._back = this._currentPage > 0 ? true : false;
    this._more = this._values.length > max ? true : false;

    if (this._type === 'vote') {
      for (let i = 0, len = this._currentValues.length; i < len; i += 1) {
        currentValues.push(this._currentValues[i].split(':')[0]);
      }
    } else {
      currentValues = this._currentValues;
    }

    this.publisher.emit('clear', this._timerId);

    this.publisher.emit('vote', {
      title: this._title,
      list: currentValues,
      back: this._back,
      more: this._more,
      time: this._timeOff === true ? null : this._time,
    });
  }

  // завершает голосование
  complete() {
    this._data = [];
    this._waitingValues = false;
    this.publisher.emit('clear', this._timerId);
    this.publisher.emit('mode', { name: 'vote', status: 'closed' });
  }

  // добавляет id таймера голосования
  assignTimer(timerId) {
    this._timerId = timerId || null;
  }
}
