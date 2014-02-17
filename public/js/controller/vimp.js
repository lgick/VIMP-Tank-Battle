define([], function () {
  // Singleton VimpCtrl
  var vimpCtrl;

  function VimpCtrl(model, view) {
    if (vimpCtrl) {
      return vimpCtrl;
    }

    vimpCtrl = this;

    this._model = model;
    this._view = view;
  }

  // преобразует данные экземпляра в данные для модели
  VimpCtrl.prototype.parse = function (name, data) {
    for (var p in data) {
      if (data.hasOwnProperty(p)) {
        if (this._model.read(p, name)) {
          this._model.update(p, name, data[p]);
        } else {
          this._model.create(
            p, name, data[p].constructor, data[p]
          );
        }
      }
    }
  };

  // обновляет представление относительно пользователя
  VimpCtrl.prototype.update = function (data) {
    var coords = VimpCtrl.getUserCoords(data);
    this._view.update(coords);
  };

  // удаляет экземпляр из модели
  // или
  // полностью очищает модель
  VimpCtrl.prototype.remove = function (name) {
    if (name) {
      this._model.remove(name);
    } else {
      this._model.remove();
    }
  };

  // возвращает координаты для отображения
  // пользователя по центру игры (нужно для view)
  VimpCtrl.getUserCoords = function (data) {
    var user = data.user
      , width = data.width
      , height = data.height
      , coords = {};

    coords.scale = user.scale;
    coords.x = -(user.x * coords.scale - width / 2);
    coords.y = -(user.y * coords.scale - height / 2);

    // устранение неточности
    coords.x = +(coords.x).toFixed(10);
    coords.y = +(coords.y).toFixed(10);

    return coords;
  };

  return VimpCtrl;
});
