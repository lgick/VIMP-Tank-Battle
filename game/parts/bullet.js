define(['createjs'], function (createjs) {
  var Shape = createjs.Shape;

  function Bullet(params) {
    this.initialize(params);
  }

  p = Bullet.prototype = createjs.extend(Bullet, Shape);
  Bullet = createjs.promote(Bullet, 'Shape');

  // инициализация
  p.initialize = function (params) {
    this.Shape_constructor();

    this.x = params[0];
    this.y = params[1];
    this.vX = params[2];
    this.vY = params[3];

    this.layer = params[4];

    this.addEventListener('tick', (function () {
      this.x += this.vX;
      this.y += this.vY;
    }).bind(this));

    this.create(params[5]);
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
  p.update = function () {
  };

  return Bullet;
});
