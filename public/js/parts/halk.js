define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , p;

  function Ship(params) {
    if (typeof params === 'object') {
      this.initialize(params);
    }
  }

  p = Ship.prototype = new Container();
  p.Container_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Container_initialize();

    this.body = new Shape();
    this.flame = new Shape();

    this.addChild(this.body);
    this.addChild(this.flame);

    this.colorA = params.colorA || '#ffffff';
    this.colorB = params.colorB || '#333333';
    this.scale = params.scale || 1;
    this.scaleX = params.scaleX || 1;
    this.scaleY = params.scaleY || 1;
    this.x = params.x || 0;
    this.y = params.y || 0;
    this.rotation = params.rotation || 0;
    this.flameStatus = params.flameStatus || false;

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
    g.moveTo(13, 0);
    g.lineTo(-1, 6);
    g.lineTo(-2, 10);
    g.lineTo(-6, 10);
    g.lineTo(-15, 12);
    g.lineTo(-9, 0);
    g.lineTo(-15, -12);
    g.lineTo(-6, -10);
    g.lineTo(-2, -10);
    g.lineTo(-1, -6);
    g.closePath();
    // кабина пилота
    g.beginStroke('#333333');
    g.beginFill('#cccccc');
    g.moveTo(7, 0);
    g.lineTo(-7, 5);
    g.lineTo(-5, 0);
    g.lineTo(-7, -5);
    g.closePath();
    // левое крыло
    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill(this.colorB);
    g.moveTo(-2, -10);
    g.lineTo(-7, -18);
    g.lineTo(-15, -16);
    g.lineTo(-15, -12);
    g.lineTo(-6, -10);
    g.closePath();
    // правое крыло
    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill(this.colorB);
    g.moveTo(-2, 10);
    g.lineTo(-7, 18);
    g.lineTo(-15, 16);
    g.lineTo(-15, 12);
    g.lineTo(-6, 10);
    g.closePath();

    this._createFlame();
  };

  // обновляет функционал экземпляра
  p.update = function (data) {
    this.x = data.x;
    this.y = data.y;
    this.rotation = data.rotation;
    this.scale = data.scale;
    this.flameStatus = data.flameStatus;

    this._createFlame();
  };

  // отображает огонь при движении
  p._createFlame = function () {
    var g = this.flame.graphics;

    g.clear();

    if (this.flameStatus === true) {
      g.setStrokeStyle(1);
      g.beginStroke('blue');
      g.beginFill('orange');
      g.moveTo(-13, -6);
      g.lineTo(-15, -4);
      g.lineTo(-13, -2);
      g.lineTo(-19, 0);
      g.lineTo(-13, 2);
      g.lineTo(-15, 4);
      g.lineTo(-13, 6);
      g.lineTo(-9, 0);
      g.closePath();
    } else {
      g.setStrokeStyle(1);
      g.beginStroke('#444444');
      g.beginFill('#440000');
      g.moveTo(-13, -6);
      g.lineTo(-15, -4);
      g.lineTo(-13, -2);
      g.lineTo(-15, 0);
      g.lineTo(-13, 2);
      g.lineTo(-15, 4);
      g.lineTo(-13, 6);
      g.lineTo(-9, 0);
      g.closePath();
    }
  };

  return Ship;
});
