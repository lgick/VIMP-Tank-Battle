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

  GameView.prototype = {
    // создает экземпляр на полотне
    add: function (instance) {
      this._stage.addChild(instance);
    },
    // обновляет полотно
    update: function (data) {
      if (data) {
        this._stage.x = data.x;
        this._stage.y = data.y;

        this._stage.scaleX = data.scale;
        this._stage.scaleY = data.scale;
      }

      this._stage.update();
    },
    // удаляет экземпляр с полотна
    remove: function (instance) {
      this._stage.removeChild(instance);
    },
    // полностью очищает полотно
    clear: function () {
      this._stage.removeAllChildren();
    }
  };

  return GameView;
});
