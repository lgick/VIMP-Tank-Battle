define(['createjs'], function (createjs) {
  var Shape = createjs.Shape;

  function Pistol(params) {
    this.initialize(params);
  }

  p = Pistol.prototype = createjs.extend(Pistol, Shape);
  Pistol = createjs.promote(Pistol, 'Shape');

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
    g.beginStroke('#fff');
    g.beginFill('#500');
    g.drawCircle(0, 0, 2);
  };

  // обновляет экземпляр
  p.update = function () {
  };

  return Pistol;
});
