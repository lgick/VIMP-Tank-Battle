define(['createjs'], function (createjs) {
  var Shape = createjs.Shape
    , Bomb
    , p;

  Bomb = function (params) {
    this.initialize(params);
  };

  p = Bomb.prototype = createjs.extend(Bomb, Shape);
  Bomb = createjs.promote(Bomb, 'Shape');

  // инициализация
  p.initialize = function (params) {
    this.Shape_constructor();

    this.layer = 2;

    this.x = params[0];
    this.y = params[1];
    this.vX = params[2];
    this.vY = params[3];
    this.rotation = params[4];

    //this.addEventListener('tick', (function () {
    //  this.x += this.vX;
    //  this.y += this.vY;
    //}).bind(this));

    this.create();
  };

  // создает экземпляр
  p.create = function () {
    var g = this.graphics;

    g.setStrokeStyle(1);
    g.beginStroke('#333');
    g.beginFill('#275C2D');
    g.drawRect(-15, -15, 30, 30, 3);
  };

  // обновляет экземпляр
  p.update = function () {
  };

  return Bomb;
});
