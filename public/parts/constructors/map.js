define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Sprite = createjs.Sprite
    , Map
    , p;

  Map = function (data) {
    if (typeof data === 'object') {
      this.initialize(data);
    }
  };

  p = Map.prototype = createjs.extend(Map, Container);
  Map = createjs.promote(Map, 'Container');

  // инициализация
  p.initialize = function (data) {
    this.Container_constructor();

    // data состоит из:
    // layer - слой
    // tiles - массив с названием тайлов
    // spriteSheet - данные картинки
    // map - карта
    // step - размер шага

    //this.layer = data.layer;
    this.layer = 1;

    this._tiles = data.tiles;
    this._map = data.map;
    this._step = data.step;

    this.createMap(data.spriteSheet);
  };

  p.createMap = function (spriteSheet) {
    var x
      , y
      , tile
      , sprite
      , i
      , len
      , lenY = this._map.length
      , lenX = this._map[0].length;

    for (y = 0; y < lenY; y += 1) {
      for (x = 0; x < lenX; x += 1) {
        tile = this._map[y][x];

        for (i = 0, len = this._tiles.length; i < len; i += 1) {
          if (tile === this._tiles[i]) {
            sprite = new Sprite(spriteSheet);
            sprite.x = x * this._step;
            sprite.y = y * this._step;
            sprite.gotoAndStop(tile);

            this.addChild(sprite);
          }
        }
      }
    }
  };

  return Map;
});
