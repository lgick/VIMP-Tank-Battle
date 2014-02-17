define([
  'Publisher',
  'Factory'
], function (
  Publisher,
  Factory
) {
  // Работает с данными игры.
  // CRUD-функционал (create, read, update, remove):
  function GameModel() {
    this._data = {};
    this.publisher = new Publisher();
  }

  // Создает экземпляры вида:
  // this._data['player']['Bob'] - игрок Bob
  // this._data['bullet']['Bob'] - пули игрока Bob
  // this._data['radar']['Bob']  - игрок Bob на радаре
  //
  // type        - тип экземпляра
  // name        - имя экземпляра
  // constructor - имя конструктора для экземпляра
  // data        - данные для создания экземпляра
  GameModel.prototype.create = function (
    type, name, constructor, data
  ) {
    this._data[type] = this._data[type] || {};

    this._data[type][name] = Factory(constructor, data);

    this.publisher.emit(
      'create', this._data[type][name]
    );
  };

  // Возвращает данные:
  // - данные конкретного типа и имени
  // - данные конкетного типа
  // - все данные
  // - ничего (если запрашиваемых данных нет)
  GameModel.prototype.read = function (type, name) {
    // если нужны данные по типу
    if (type) {
      // .. и они существуют
      if (this._data[type]) {
        // .. и также нужны данные конкретного имени
        if (name) {
          // .. и они существуют
          if (this._data[type][name]) {
            return this._data[type][name];
          }
        } else {
          return this._data[type];
        }
      }
    } else {
      return this._data;
    }
  };

  // Обновляет данные экземпляра
  GameModel.prototype.update = function (
    type, name, data
  ) {
    this._data[type][name].update(data);
  };

  // Удаляет данные:
  // - по имени экземпляра в каждом типе
  // - полностью
  //
  // name - имя экземпляра (необязательно)
  GameModel.prototype.remove = function (name) {
    if (name) {
      for (var prop in this._data) {
        if (this._data.hasOwnProperty(prop)) {
          if (this._data[prop][name]) {
            this.publisher.emit(
              'remove', this._data[prop][name]
            );

            delete this._data[prop][name];
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
