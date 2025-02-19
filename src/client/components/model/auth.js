import Publisher from '../../../server/lib/publisher.js';

// Singleton AuthModel

let authModel;

export default class AuthModel {
  constructor() {
    if (authModel) {
      return authModel;
    }

    authModel = this;

    this._data = {};
    this._options = {};
    this._errors = [];
    this._sendStatus = false;

    this.publisher = new Publisher();
  }

  // добавляет данные
  add(data) {
    const { name, value, options } = data;
    this._data[name] = value;
    this._options[name] = options;

    this.publisher.emit('form', { name, value });
  }

  // обновление данных
  // если value невалиден, возвращается текущий value
  update(data) {
    const { name, value } = data;
    const { regExp } = this._options[name];

    if (regExp) {
      if (regExp.test(value)) {
        this._data[name] = value;
      } else {
        this._data[name] = value = '';
      }
    } else {
      this._data[name] = value;
    }

    this.publisher.emit('form', { name, value });
  }

  // валидация всех данных
  validate() {
    Object.keys(this._data).forEach(key => {
      const { regExp } = this._options[key];

      if (regExp && !regExp.test(this._data[key])) {
        this._errors.push({ name: key, value: this._data[key] });
      }
    });
  }

  // отправка данных на сервер
  send() {
    if (this._errors.length) {
      this.publisher.emit('error', this._errors);
      this._errors = [];
    } else {
      if (this._sendStatus) {
        return;
      }

      this.publisher.emit('socket', this._data);

      this._sendStatus = true;
    }
  }

  // разбор ответа сервера
  parseRes(err) {
    const arr = [];

    // если авторизация успешна
    if (!err) {
      Object.keys(this._data).forEach(key => {
        const { storage } = this._options[key];

        if (storage) {
          arr.push({ name: storage, value: this._data[key] });
        }
      });

      this.publisher.emit('ok', arr);
      // иначе
    } else {
      this.publisher.emit('error', err);
    }

    this._sendStatus = false;
  }
}
