define([], function () {
  // Singleton RadarCtrl
  var radarCtrl;

  function RadarCtrl(model, view) {
    if (radarCtrl) {
      return radarCtrl;
    }

    radarCtrl = this;

    this._model = model;
    this._view = view;
  }

  // преобразует данные экземпляра в данные для модели
  RadarCtrl.prototype.parse = function (name, data) {
    if (this._model.read('radar', name)) {
      this._model.update('radar', name, data);
    } else {
      this._model.create(
        'radar', name, data.constructor, data
      );
    }
  };

  // обновляет представление относительно пользователя
  RadarCtrl.prototype.update = function (data) {
    var coords = RadarCtrl.getUserCoords(data);
    this._view.update(coords);
  };

  // удаляет экземпляр из модели
  // или
  // полностью очищает модель
  RadarCtrl.prototype.remove = function (name) {
    if (name) {
      this._model.remove(name);
    } else {
      this._model.remove();
    }
  };

  // возвращает координаты для отображения
  // пользователя по центру игры (нужно для view)
  RadarCtrl.getUserCoords = function (data) {
    var user = data.user
      , ratio = data.ratio
      , width = data.width
      , height = data.height
      , coords = {};

    coords.scale = +(user.scale / ratio).toFixed(10);
    coords.x = -(user.x * coords.scale - width / 2);
    coords.y = -(user.y * coords.scale - height / 2);

    // устранение неточности
    coords.x = +(coords.x).toFixed(10);
    coords.y = +(coords.y).toFixed(10);

    return coords;
  };

  return RadarCtrl;
});
