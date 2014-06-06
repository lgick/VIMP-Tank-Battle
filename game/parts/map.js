define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Sprite = createjs.Sprite
    , p;

  function Map(data) {
    if (typeof data === 'object') {
      this.initialize(data);
    }
  }

  p = Map.prototype = new Container();
  p.Container_initialize = p.initialize;

  // инициализация
  p.initialize = function (data) {
    this.Container_initialize();

    this.layer = 0;

    this.map = data.map;
    this.step = data.step;

    this.createBase(data.options);
    this.createMap(data.spriteSheet);
  };

  p.createMap = function (spriteSheet) {
    var x
      , y
      , sprite
      , lenY = this.map.length
      , lenX = this.map[0].length;

    for (y = 0; y < lenY; y += 1) {
      for (x = 0; x < lenX; x += 1) {
        sprite = new Sprite(spriteSheet);
        sprite.x = x * this.step;
        sprite.y = y * this.step;
        sprite.gotoAndStop(this.map[y][x]);

        this.addChild(sprite);
      }
    }
  };

  p.createBase = function (data) {
    var shape = new Shape()
      , g = shape.graphics
      , width = data.width || 2000
      , height = data.height || 2000
      , borderColor = data.borderColor || '#fff'
      , borderThickness = data.borderThickness || 10
      , backgroundColor = data.backgroundColor || '#f00';

    g.beginFill(backgroundColor);
    g.setStrokeStyle(borderThickness);
    g.beginStroke(borderColor);
    g.drawRect(0, 0, width, height);

    this.addChild(shape);
  };

  return Map;
});
