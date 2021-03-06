define(['createjs'], function (createjs) {
  var Shape = createjs.Shape
    , Shadow = createjs.Shadow
    , p;

  function Radar(params) {
    this.initialize(params);
  }

  p = Radar.prototype = createjs.extend(Radar, Shape);
  Radar = createjs.promote(Radar, 'Shape');

  // инициализация
  p.initialize = function (params) {
    this.Shape_constructor();

    this.layer = 2;

    // params с сервера имеют вид:
    // [x, y, rotation, gunRotation, type]
    this.x = params[0] || 0;
    this.y = params[1] || 0;
    this.rotation = params[2] || 0;

    // все модели на радаре увеличены в 20 раз
    this.scaleX = 20;
    this.scaleY = 20;

    this.shadow = new Shadow('#333', 2, 2, 3);

    this.create(params[4]);
  };

  // создание игрока
  p.create = function (type) {
    var g;

    if (type === 1) {
      this.colorA = '#fff';
      this.colorB = '#333';
    } else if (type === 2) {
      this.colorA = '#eee';
      this.colorB = '#333';
    } else {
      this.colorA = '#000';
      this.colorB = '#333';
    }

    g = this.graphics;

    g.clear();

    g.beginStroke(this.colorB);
    g.beginFill(this.colorA);
    g.moveTo(7, 0);
    g.lineTo(-7, 5);
    g.lineTo(-5, 0);
    g.lineTo(-7, -5);
    g.closePath();
  };

  // обновляет экземпляр
  p.update = function (params) {
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];

    if (typeof params[4] === 'number') {
      this.create(params[4]);
    }
  };

  return Radar;
});
