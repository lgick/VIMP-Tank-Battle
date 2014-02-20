define(['createjs'], function (createjs) {
  var Shape = createjs.Shape
    , Shadow = createjs.Shadow
    , p;

  function Radar(params) {
    if (typeof params === 'object') {
      this.initialize(params);
    }
  }

  p = Radar.prototype = new Shape();
  p.Shape_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Shape_initialize();

    this.x = params.x || 0;
    this.y = params.y || 0;
    this.rotation = params.rotation || 0;
    this.colorA = params.colorA || '#ffffff';
    this.colorB = params.colorB || '#333333';

    // все модели на радаре увеличены в 20 раз
    this.scaleX = params.scaleX || 20;
    this.scaleY = params.scaleY || 20;

    this.scale = params.scale || 1;

    this.shadow = new Shadow('#333', 2, 2, 3);

    this.create();
  };

  // создание игрока
  p.create = function (colorA, colorB) {
    var g = this.graphics;

    this.colorA = colorA ? colorA : this.colorA;
    this.colorB = colorB ? colorB : this.colorB;

    g.clear();

    g.beginStroke(this.colorB);
    g.beginFill(this.colorA);
    g.moveTo(7, 0);
    g.lineTo(-7, 5);
    g.lineTo(-5, 0);
    g.lineTo(-7, -5);
    g.closePath();
  };

  // обновляет функционал экземпляра
  p.update = function (data) {
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.scale = data.scale;
  };

  return Radar;
});
