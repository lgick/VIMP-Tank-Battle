define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Sprite = createjs.Sprite
    , Map
    , p;

  Map = function (data) {
    var constructor = this.constructor;

    this.Container_constructor();

    // data состоит из:
    // layer - слой
    // tiles - массив с названием тайлов
    // spriteSheet - данные картинки
    // map - карта
    // step - размер шага

    this._map = constructor.map;
    this._spriteSheet = constructor.spriteSheet;
    this._step = constructor.step;

    this.layer = data.layer || 1;
    this._tiles = data.tiles;

    this.create();
  };

  p = Map.prototype = createjs.extend(Map, Container);
  Map = createjs.promote(Map, 'Container');

  p.create = function () {
    var x
      , y
      , tile
      , sprite
      , lenY
      , lenX;

    for (y = 0, lenY = this._map.length; y < lenY; y += 1) {
      for (x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
        tile = this._map[y][x];

        if (this._tiles.indexOf(tile) !== -1) {
          sprite = new Sprite(this._spriteSheet);
          sprite.x = x * this._step;
          sprite.y = y * this._step;
          sprite.gotoAndStop(tile);

          this.addChild(sprite);
        }
      }
    }
  };

  p.update = function () {
  };

  return Map;
});
