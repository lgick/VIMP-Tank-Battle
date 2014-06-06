define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , p;

  function Bullets(params) {
    this.initialize(params);
  }

  p = Bullets.prototype = new Container();
  p.Container_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Container_initialize();

    this.layer = 1;

    var i = 0
      , len = params.length
      , shape
      , g;

    for (; i < len; i += 1) {
      shape = new Shape();
      shape.x = params[i][0];
      shape.y = params[i][1];

      g = shape.graphics;
      g.setStrokeStyle(1);
      g.beginStroke('#333');
      g.beginFill('#fff');
      g.drawCircle(0, 0, 2);

      this.addChild(shape);
    }
  };

  return Bullets;
});
