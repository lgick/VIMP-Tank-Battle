import Publisher from '../../../lib/Publisher.js';
import Factory from '../../../lib/factory.js';

export default class GameModel {
  constructor() {
    this._data = {};
    this.publisher = new Publisher();
  }

  // создает экземпляры вида:
  // this._data['Tank']['01']   - игрок c id '01'
  // this._data['Map']['1']     - данные карты на 1 слое
  // this._data['Bullet']['f2'] - пуля с id 'f2'
  //
  // constructor - имя конструктора для экземпляра
  // id          - id экземпляра
  // data        - данные для создания экземпляра
  create(constructor, id, data) {
    this._data[constructor] = this._data[constructor] || {};
    this._data[constructor][id] = Factory(constructor, data);
    this.publisher.emit('create', this._data[constructor][id]);
  }

  // создает экземпляр эффекта (например анимация выстрела или дыма)
  // сохраняет экземпляр в списке на выполнение
  createEffect(constructor, data) {
    const item = Factory(constructor, data);
    this.publisher.emit('createEffect', item);
  }

  // возвращает данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора
  // - все данные
  read(constructor, id) {
    // если нужны данные по конструктору
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // .. и также нужны данные конкретного id
        if (id) {
          // .. и они существуют
          if (this._data[constructor][id]) {
            return this._data[constructor][id];
          }
        } else {
          return this._data[constructor];
        }
      }
    } else {
      return this._data;
    }
  }

  // обновляет данные экземпляра
  update(constructor, id, data) {
    if (data === null) {
      this.remove(constructor, id);
    } else {
      this._data[constructor][id].update(data);
    }
  }

  // удаляет данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора (пустой конструктор)
  // - все данные (чистое полотно)
  //
  // constructor - имя конструктора для экземпляра (необязательно)
  // id          - id экземпляра (необязательно)
  remove(constructor, id) {
    // если данные по конструктору
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // если данные по конкретному id
        if (id) {
          // .. и они существуют
          if (this._data[constructor][id]) {
            this.publisher.emit('remove', this._data[constructor][id]);
            delete this._data[constructor][id];
          }
        } else {
          const data = this._data[constructor];

          for (const id in data) {
            if (data.hasOwnProperty(id)) {
              this.publisher.emit('remove', data[id]);
            }
          }

          this._data[constructor] = {};
        }
      }
    } else {
      for (const constructor in this._data) {
        if (this._data.hasOwnProperty(constructor)) {
          const data = this._data[constructor];

          for (const id in data) {
            if (data.hasOwnProperty(id)) {
              this.publisher.emit('remove', data[id]);
            }
          }
        }
      }

      this._data = {};
    }
  }
}
