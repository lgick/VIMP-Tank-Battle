define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , p;

  function Tank(params) {
    if (typeof params === 'object') {
      this.initialize(params);
    }
  }

  p = Tank.prototype = new Container();
  p.Container_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Container_initialize();

    this.body = new Shape();
    this.gun = new Shape();

    this.addChild(this.body);
    this.addChild(this.gun);

    this.colorA = params.colorA || '#ffffff';
    this.colorB = params.colorB || '#333333';
    this.scale = params.scale || 1;
    this.scaleX = params.scaleX || 1;
    this.scaleY = params.scaleY || 1;
    this.x = params.x || 0;
    this.y = params.y || 0;
    this.rotation = params.rotation || 0;

    this.gun.rotation = params.gunRotation || 0;

    this.create();
  };

  // создание тела
  p.create = function (colorA, colorB) {
    var g = this.body.graphics;

    this.colorA = colorA ? colorA : this.colorA;
    this.colorB = colorB ? colorB : this.colorB;

    g.clear();

    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill(this.colorA);
    g.moveTo(22, -18);
    g.lineTo(-26, -18);
    g.lineTo(-26, 18);
    g.lineTo(22, 18);
    g.closePath();

    this._createGun(this.colorB);
  };

  // обновляет функционал экземпляра
  p.update = function (data) {
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.scale = data.scale;
    this.gun.rotation = data.gunRotation;
  };

  p._createGun = function (colorB) {
    var g = this.gun.graphics;

    g.clear();

    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill(colorB);
    g.moveTo(16, -5);
    g.lineTo(5, -12);
    g.lineTo(-5, -12);
    g.lineTo(-16, -5);
    g.lineTo(-16, 5);
    g.lineTo(-5, 12);
    g.lineTo(5, 12);
    g.lineTo(16, 5);
    g.closePath();

    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill('#333333');
    g.moveTo(28, -3);
    g.lineTo(3, -3);
    g.lineTo(3, 3);
    g.lineTo(28, 3);
    g.closePath();
  };

  return Tank;
});
