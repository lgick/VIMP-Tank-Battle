define(['Publisher', 'Factory'], function (Publisher, Factory) {
  // Работает с данными игры.
  function GameModel() {
    this._data = {};
    this.publisher = new Publisher();
  }

  // Создает экземпляры вида:
  // this._data['Tank']['Bob'] - игрок Bob
  // this._data['Radar']['Bob'] - игрок Bob на радаре
  //
  // constructor - имя конструктора для экземпляра
  // name        - имя экземпляра
  // data        - данные для создания экземпляра
  GameModel.prototype.createSingle = function (constructor, name, data) {
    this._data[constructor] = this._data[constructor] || {};
    this._data[constructor][name] = Factory(constructor, data);
    this.publisher.emit('create', this._data[constructor][name]);
  };

  // Создает экземпляры вида:
  // this._data['Bullets']['Bob'][number] - пули игрока Bob
  //
  // constructor - имя конструктора для экземпляра
  // name        - имя экземпляра
  // data        - данные для создания экземпляра
  GameModel.prototype.createKit = function (constructor, name, data) {
    var i = 0
      , len = data.length;
     // , kit;

    // this._data[constructor] = this._data[constructor] || {};

    // kit = this._data[constructor][name] = {};

    for (; i < len; i += 1) {
      // kit[i] = Factory(constructor, data[i]);
      // this.publisher.emit('create', kit[i]);
      // TODO: проверить
      this.publisher.emit('create', Factory(constructor, data[i]));
    }
  };

  // Возвращает данные:
  // - данные конкретного конструктора и имени
  // - данные конкетного конструктора
  // - все данные
  // - ничего (если запрашиваемых данных нет)
  GameModel.prototype.read = function (constructor, name) {
    // если нужны данные по типу
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // .. и также нужны данные конкретного имени
        if (name) {
          // .. и они существуют
          if (this._data[constructor][name]) {
            return this._data[constructor][name];
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
  GameModel.prototype.update = function (constructor, name, data) {
    this._data[constructor][name].update(data);
  };

  // Удаляет данные:
  // - по имени экземпляра в каждом конструкторе
  // - по имени экземпляра во всех конструкторах
  // - полностью
  //
  // name - имя экземпляра (необязательно)
  GameModel.prototype.remove = function (name, constructor) {
    var p;

    if (name) {
      if (constructor) {
        if (this._data[constructor] && this._data[constructor][name]) {
          this.publisher.emit('remove', this._data[constructor][name]);
          delete this._data[constructor][name];
        }
      } else {
        for (p in this._data) {
          if (this._data.hasOwnProperty(p)) {
            if (this._data[p][name]) {
              this.publisher.emit('remove', this._data[p][name]);
              delete this._data[p][name];
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
