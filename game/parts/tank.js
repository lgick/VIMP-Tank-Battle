define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , p;

  function Tank(params) {
    this.initialize(params);
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

    // params с сервера имеют вид:
    // [x, y, rotation, gunRotation, type]
    this.x = params[0] || 0;
    this.y = params[1] || 0;
    this.rotation = params[2] || 0;
    this.gun.rotation = params[3] || 0;

    this.create(params[4]);
  };

   // создать экземпляр
  p.create = function (type) {
    var g;

    if (type === 0) {
      this.colorA = '#eee';
      this.colorB = '#252';
    } else if (type === 1) {
      this.colorA = '#eee';
      this.colorB = '#522';
    } else {
      this.colorA = '#000';
      this.colorB = '#333';
    }

    // создание body
    g = this.body.graphics;

    g.clear();

    g.setStrokeStyle(1);
    g.beginStroke('#333');
    g.beginFill(this.colorA);
    g.moveTo(22, -18);
    g.lineTo(-26, -18);
    g.lineTo(-26, 18);
    g.lineTo(22, 18);
    g.closePath();

    // создание gun
    g = this.gun.graphics;

    g.clear();

    g.setStrokeStyle(1);
    g.beginStroke('#cccccc');
    g.beginFill(this.colorB);
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

 // обновляет экземпляр
  p.update = function (params) {
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this.gun.rotation = params[3];

    if (params[4]) {
      this.create(params[4]);
    }
  };

  return Tank;
});
