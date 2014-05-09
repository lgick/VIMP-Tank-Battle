define(['Publisher', 'Factory'], function (Publisher, Factory) {
  // Работает с данными игры.
  function GameModel() {
    this._data = {};
    this.publisher = new Publisher();
  }

  // Создает экземпляры вида:
  // this._data['Tank']['01'] - игрок c id '01'
  // this._data['Bullets']['01'] - пули игрока
  //
  // constructor - имя конструктора для экземпляра
  // id          - id экземпляра
  // data        - данные для создания экземпляра
  GameModel.prototype.create = function (constructor, id, data) {
    this._data[constructor] = this._data[constructor] || {};
    this._data[constructor][id] = Factory(constructor, data);
    this.publisher.emit('create', this._data[constructor][id]);
  };

  // Возвращает данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора
  // - все данные
  GameModel.prototype.read = function (constructor, id) {
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
  };

  // Обновляет данные экземпляра
  GameModel.prototype.update = function (constructor, id, data) {
    if (data === null) {
      this.remove(constructor, id);
    } else {
      this._data[constructor][id].update(data);
    }
  };

  // Удаляет данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора (пустой конструктор)
  // - все данные (чистое полотно)
  //
  // constructor - имя конструктора для экземпляра (необязательно)
  // id          - id экземпляра (необязательно)
  GameModel.prototype.remove = function (constructor, id) {
    var p
      , data;

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
          data = this._data[constructor];

          for (p in data) {
            if (data.hasOwnProperty(p)) {
              this.publisher.emit('remove', data[p]);
            }
          }

          this._data[constructor] = {};
        }
      }
    } else {
      this._data = {};
      this.publisher.emit('clear');
    }
  };

  return GameModel;
});
