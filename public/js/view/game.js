define(['createjs'], function (createjs) {
  // Объект для инициализации представлений игры
  var Stage = createjs.Stage;

  function GameView(model, stage) {
    this._stage = new Stage(stage);

    this._model = model;

    // подписка на события модели
    this._mPublic = this._model.publisher;

    this._mPublic.on('create', 'add', this);
    this._mPublic.on('remove', 'remove', this);
    this._mPublic.on('clear', 'clear', this);
  }

  // создает экземпляр на полотне
  GameView.prototype.add = function (instance) {
    this._stage.addChild(instance);
  };

  // вычисляет координаты для отображения
  // пользователя по центру игры и обновляет полотно
  GameView.prototype.update = function (user, zoom) {
    var width = this._stage.canvas.width
      , height = this._stage.canvas.height
      , zoom = zoom || 1
      , scale = +(user.scale * zoom).toFixed(10)
      , x = -(user.x * scale - width / 2)
      , y = -(user.y * scale - height / 2);

    // устранение неточности
    x = +(x).toFixed(10);
    y = +(y).toFixed(10);

    this._stage.x = x;
    this._stage.y = y;

    this._stage.scaleX = this._stage.scaleY = scale;

    this._stage.update();
  };

  // удаляет экземпляр с полотна
  GameView.prototype.remove = function (instance) {
    this._stage.removeChild(instance);
  };

  // полностью очищает полотно
  GameView.prototype.clear = function () {
    this._stage.removeAllChildren();
  };

  return GameView;
});
