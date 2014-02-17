define([], function () {
  // Singleton BackCtrl
  var backCtrl;

  function BackCtrl(model, view) {
    if (backCtrl) {
      return backCtrl;
    }

    backCtrl = this;

    this._model = model;
    this._view = view;
  }

  // преобразует данные экземпляра в данные для модели
  BackCtrl.prototype.parse = function (name, data) {
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

  // обновляет представление
  BackCtrl.prototype.update = function () {
    this._view.update();
  };

  // удаляет экземпляр из модели
  // или
  // полностью очищает модель
  BackCtrl.prototype.remove = function (name) {
    if (name) {
      this._model.remove(name);
    } else {
      this._model.remove();
    }
  };

  // преобразует координаты
  BackCtrl.prototype.updateCoords = function (data) {
    var type = 'back'
      , name = 'background'
      , x = data.newData.x - data.oldData.x
      , y = data.newData.y - data.oldData.y
      , back = this._model.read(type, name);

    if (back && x || y) {
      this._model.update(type, name, {
        x: x,
        y: y,
        scale: data.newData.scale
      });
    }
  };

  return BackCtrl;
});
