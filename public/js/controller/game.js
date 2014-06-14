define([], function () {
  // Контроллер игры
  function GameCtrl(model, view) {
    this._model = model;
    this._view = view;
  }

  // разбирает данные
  GameCtrl.prototype.parse = function (constructor, instances, type) {
    // type (тип работы с данными):
    // type === 1: если нет объекта - создать, если есть - обновить
    // если данные для объекта === null, то объект удаляется
    //
    // type === 2: объект создается каждый раз новый.
    // За обновление и удаление объекта отвечает его конструктор,
    // который получает ссылку к полотну
    //
    // type === 3: объект создается каждый раз новый, предыдущий удаляется

    var id;

    if (type === 1) {
      for (id in instances) {
        if (instances.hasOwnProperty(id)) {
          if (this._model.read(constructor, id)) {
            this._model.update(constructor, id, instances[id]);
          } else {
            this._model.create(constructor, id, instances[id]);
          }
        }
      }
    } else if (type === 2) {
      for (id in instances) {
        if (instances.hasOwnProperty(id)) {
          this._model.createMore(constructor, id, instances[id]);
        }
      }
    } else if (type === 3) {
      for (id in instances) {
        if (instances.hasOwnProperty(id)) {
          this._model.remove(constructor, id);
          this._model.create(constructor, id, instances[id]);
        }
      }
    }
  };

  // обновляет представление относительно пользователя
  GameCtrl.prototype.update = function (coords, scale) {
    this._view.update(coords, scale);
  };

  // удаляет данные игры
  GameCtrl.prototype.remove = function (constructor, id) {
    this._model.remove(constructor, id);
  };

  return GameCtrl;
});
