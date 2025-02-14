define([], function () {
  // Контроллер игры
  function GameCtrl(model, view) {
    this._model = model;
    this._view = view;
  }

  // обрабатывает данные
  GameCtrl.prototype.parse = function (constructor, instances) {
    var id;

    for (id in instances) {
      if (instances.hasOwnProperty(id)) {
        // если экземпляр существует - обновить
        if (this._model.read(constructor, id)) {
          this._model.update(constructor, id, instances[id]);

        // иначе, если есть данные для создания экземпляра - создать
        } else if (instances[id]) {
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
