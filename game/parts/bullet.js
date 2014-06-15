define(['createjs'], function (createjs) {
  var Shape = createjs.Shape;

  function Bullet(params, gameModel) {
    this._gameModel = gameModel;

    this.initialize(params);
  }

  p = Bullet.prototype = new Shape();
  p.Shape_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Shape_initialize();

    var vX = Math.round(Math.cos(params[2]) * 20) + params[4]
      , vY = Math.round(Math.sin(params[2]) * 20) + params[5];

    this.x = params[0];
    this.y = params[1];
    this.layer = params[3];

    this.addEventListener('tick', (function () {
      this.x += vX;
      this.y += vY;
    }).bind(this));

    this.create(params[6]);
  };

  // создает экземпляр
  p.create = function (type) {
    var g = this.graphics;

    switch (type) {
      case 1:
        g.setStrokeStyle(1);
        g.beginStroke('#333');
        g.beginFill('#fff');
        g.drawCircle(0, 0, 2);
        break;
      case 2:
        g.setStrokeStyle(1);
        g.beginStroke('#fff');
        g.beginFill('#500');
        g.drawCircle(0, 0, 5);
        break;
    }
  };

  // обновляет экземпляр
  p.update = function (params) {
    this.removeEventListener('tick');
  };

  return Bullet;
});
