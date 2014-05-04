define(['Publisher', 'Factory'], function (Publisher, Factory) {
  // Работает с данными игры.
  function GameModel() {
    this._data = {};
    this.publisher = new Publisher();
  }

  // Создает экземпляры вида:
  // this._data['Tank']['Bob'] - игрок Bob
  // this._data['Bullets']['Bob'] - пули игрока Bob
  // this._data['Radar']['Bob'] - игрок Bob на радаре
  //
  // constructor - имя конструктора для экземпляра
  // i           - порядковый номер экземпляра
  // data        - данные для создания экземпляра
  GameModel.prototype.create = function (constructor, i, data) {
    this._data[constructor] = this._data[constructor] || [];
    this._data[constructor][i] = Factory(constructor, data);
    this.publisher.emit('create', this._data[constructor][i]);
  };

  // Возвращает данные:
  // - одного экземпляра конструктора
  // - всех экземляров конструктора
  // - все данные
  GameModel.prototype.read = function (constructor, i) {
    // если нужны данные по конструктору
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // .. и также нужны данные конкретного экземпляра
        if (typeof i === 'number') {
          // .. и они существуют
          if (this._data[constructor][i]) {
            return this._data[constructor][i];
          }
        } else {
          return this._data[constructor];
        }
      }
    } else {
      return this._data;
    }
  };

  // Обновляет данные экземпляра или удаляет экземпляр
  GameModel.prototype.update = function (constructor, i, data) {
    if (data === null) {
      this.publisher.emit('remove', this._data[constructor][i]);
      delete this._data[constructor][i];
    } else {
      this._data[constructor][i].update(data);
    }
  };

  // Удаляет данные:
  // - конкретного экземпляра в конструкторе (по порядковому номеру)
  // - всех экземпляров в конструкторе
  // - всех экземпляров во всех конструкторах (чистое полотно)
  //
  // constructor - имя конструктора для экземпляра (необязательно)
  // i           - порядковый номер экземпляра (необязательно)
  GameModel.prototype.remove = function (constructor, i) {
    var len;

    // если данные по конструктору
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // если данные по конкретному экземпляру
        if (typeof i === 'number') {
          // .. и они существуют
          if (this._data[constructor][i]) {
            this.publisher.emit('remove', this._data[constructor][i]);
            delete this._data[constructor][i];
          }
        } else {
          for (i = 0, len = this._data[constructor].length; i < len; i += 1) {
            this.publisher.emit('remove', this._data[constructor][i]);
          }
          delete this._data[constructor];
        }
      }
    } else {
      this._data = [];
      this.publisher.emit('clear');
    }
  };

  // Удаляет данные:
  // - по порядковому номеру экземпляра в каждом конструкторе
  // - по порядковому номеру экземпляра во всех конструкторах
  // - полностью
  //
  // i           - порядковый номер экземпляра (необязательно)
  // constructor - имя конструктора для экземпляра (необязательно)
  GameModel.prototype.removeInstance = function (i, constructor) {
    var p;

    if (typeof i === 'number') {
      if (constructor) {
        if (this._data[constructor] && this._data[constructor][i]) {
          this.publisher.emit('remove', this._data[constructor][i]);
          delete this._data[constructor][i];
        }
      } else {
        for (p in this._data) {
          if (this._data.hasOwnProperty(p)) {
            if (this._data[p][i]) {
              this.publisher.emit('remove', this._data[p][i]);
              delete this._data[p][i];
            }
          }
        }
      }
    } else {
      this._data = {};
      this.publisher.emit('clear');
    }
  };

  return GameModel;
});
