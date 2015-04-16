define(['createjs'], function (createjs) {
  var Shape = createjs.Shape;

  function Gun(params) {
    this.initialize(params);
  }

  p = Gun.prototype = createjs.extend(Gun, Shape);
  Gun = createjs.promote(Gun, 'Shape');

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

    this.create();
  };

  // создает экземпляр
  p.create = function () {
    var g = this.graphics;

    g.setStrokeStyle(1);
    g.beginStroke('#333');
    g.beginFill('#f00');
    g.drawCircle(0, 0, 6);
  };

  // обновляет экземпляр
  p.update = function () {
  };

  return Gun;
});
