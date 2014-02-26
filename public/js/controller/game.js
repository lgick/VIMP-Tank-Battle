define([], function () {
  // Singleton GameCtrl
  var gameCtrl;

  function GameCtrl(model, view) {
    if (gameCtrl) {
      return gameCtrl;
    }

    gameCtrl = this;

    this._model = model;
    this._view = view;
  }

  // преобразует данные с сервера в данные для модели
  GameCtrl.prototype.parse = function (data) {
    var constructors = data.constructors
      , instances = data.instances
      , i = 0
      , len = constructors.length
      , constructor
      , instance
      , p
      , i2
      , len2;

    for (; i < len; i += 1) {
      constructor = constructors[i];

      for (p in instances) {
        if (instances.hasOwnProperty(p)) {
          instance = instances[p];
          i2 = 0;
          len2 = instance.length;

          for (; i2 < len2; i2 += 1) {
            if (this._model.read(p, name)) {
              this._model.update(p, name, data[p]);
            } else {
              this._model.create(
                p, name, data[p].constructor, data[p]
              );
            }
          }
        }
      }
    }
  };

  // обновляет представление относительно пользователя
  GameCtrl.prototype.update = function (data) {
    var coords = GameCtrl.getUserCoords(data);
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
  GameCtrl.getUserCoords = function (data) {
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

  return GameCtrl;
});
