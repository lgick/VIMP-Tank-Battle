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
  GameCtrl.prototype.update = function (user, sizes, ratio) {
    var coords = GameCtrl.getUserCoords(user, sizes, ratio);
    this._view.update(coords);
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

  // возвращает координаты для отображения
  // пользователя по центру игры (нужно для view)
  GameCtrl.getUserCoords = function (user, sizes, ratio) {
    var coords = {};

    coords.scale = +(user.scale / ratio).toFixed(10);
    coords.x = -(user.x * coords.scale - sizes.width / 2);
    coords.y = -(user.y * coords.scale - sizes.height / 2);

    // устранение неточности
    coords.x = +(coords.x).toFixed(10);
    coords.y = +(coords.y).toFixed(10);

    return coords;
  };

  return GameCtrl;
});
