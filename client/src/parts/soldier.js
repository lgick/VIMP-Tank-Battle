define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Soldier
    , p;

  Soldier = function (params) {
    this.initialize(params);
  };

  p = Soldier.prototype = createjs.extend(Soldier, Container);
  Soldier = createjs.promote(Soldier, 'Container');

  // инициализация
  p.initialize = function (params) {
    this.Container_constructor();

    this.layer = 2;

    this.body = new Shape();

    this.addChild(this.body);

    // params с сервера имеют вид:
    // [x, y, rotation, type, name]
    this.x = params[0] || 0;
    this.y = params[1] || 0;
    this.rotation = params[2] || 0;
    this.name = params[4];

    this.create(params[3]);
  };

   // создать экземпляр
  p.create = function (type) {
    var g;

    if (type === 1) {
      this.colorA = '#f00';
    } else if (type === 2) {
      this.colorA = '#eee';
    } else {
      this.colorA = '#000';
    }

    // создание body
    g = this.body.graphics;

    g.clear();

    g.setStrokeStyle(1);
    g.beginStroke('#fff');
    g.beginFill(this.colorA);
    g.drawCircle(0, 0, 14);
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

    if (typeof params[3] === 'number') {
      this.create(params[3]);
    }
  };

  return Soldier;
});
