define([], function () {
  // Контроллер игры
  function GameCtrl(model, view) {
    this._model = model;
    this._view = view;
  }

  // парсит данные
  GameCtrl.prototype.parse = function (constructor, instances, cache) {
    var name;

    if (cache) {
      for (name in instances) {
        if (instances.hasOwnProperty(name)) {
          if (this._model.read(constructor, name)) {
            this._model.update(constructor, name, instances[name]);
          } else {
            this._model.create(constructor, name, instances[name]);
          }
        }
      }
    } else {
      for (name in instances) {
        if (instances.hasOwnProperty(name)) {
          this._model.remove(name, constructor);
          this._model.create(constructor, name, instances[name]);
        }
      }
    }
  };

  // обновляет представление относительно пользователя
  GameCtrl.prototype.update = function (user, zoom) {
    this._view.update(user, zoom);
  };

  // удаляет экземпляр из модели
  // или
  // полностью очищает модель
  GameCtrl.prototype.remove = function (name) {
    if (name) {
      this._model.remove(name);
    } else {
      this._model.remove();
    }
  };

  return GameCtrl;
});
