define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Sprite = createjs.Sprite
    , SpriteSheet = createjs.SpriteSheet
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

    this.map = data.map;

    var spriteSheet = new SpriteSheet(data.spriteSheet);

    this.createBase(data.options);
    this.createMap(spriteSheet);
  };

  p.createMap = function (spriteSheet) {
    var x = 0
      , y = 0
      , sprite
      , lenY = this.map.length
      , lenX = this.map[0].length;

    for (y = 0; y < lenY; y += 1) {
      for (x = 0; x < lenX; x += 1) {
        sprite = new Sprite(spriteSheet);
        sprite.x = x * 32;
        sprite.y = y * 32;
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
  }

  return Map;
});
