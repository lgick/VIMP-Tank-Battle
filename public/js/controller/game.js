define([], function () {
  // Контроллер игры
  function GameCtrl(model, view) {
    this._model = model;
    this._view = view;
  }

  // разбирает данные
  GameCtrl.prototype.parse = function (constructor, instances, cache) {
    var i = 0
      , len = instances.length;

    if (cache) {
      for (; i < len; i += 1) {
        if (this._model.read(constructor, i)) {
          this._model.update(constructor, i, instances[i]);
        } else {
          this._model.create(constructor, i, instances[i]);
        }
      }
    } else {
      this._model.remove(constructor);

      for (; i < len; i += 1) {
        this._model.create(constructor, i, instances[i]);
      }
    }
  };

  // обновляет представление относительно пользователя
  GameCtrl.prototype.update = function (coords, scale) {
    this._view.update(coords, scale);
  };

  // удаляет данные игры
  GameCtrl.prototype.remove = function (constructor, i) {
    this._model.remove(constructor, i);
  };

  return GameCtrl;
});
