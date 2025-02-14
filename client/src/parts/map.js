define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Sprite = createjs.Sprite
    , Bitmap = createjs.Bitmap
    , Map
    , p;

  Map = function (data) {
    this.Container_constructor();

    // если статические данные
    if (data.type === 'static') {
      // data состоит из:
      // layer - слой
      // tiles - массив с названием тайлов
      // spriteSheet - данные картинки
      // map - карта
      // step - размер шага
      this._map = data.map;
      this._tiles = data.tiles;
      this._spriteSheet = data.spriteSheet;
      this._step = data.step;
      this.layer = data.layer || 1;

      this.createStatic();

    // иначе если динамические данные
    } else if (data.type === 'dynamic') {
      // [src, position, rotation, width, height, layer]
      this.width = data.width;
      this.height = data.height;
      this.x = data.position[0] - this.width / 2;
      this.y = data.position[1] - this.height / 2;
      this.rotation = data.angle;
      this.layer = data.layer || 2;

      this.addChild(new Bitmap(data.src));
    }
  };

  p = Map.prototype = createjs.extend(Map, Container);
  Map = createjs.promote(Map, 'Container');

  p.createStatic = function () {
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

  p.update = function (data) {
    this.x = data[0] - this.width / 2;
    this.y = data[1] - this.height / 2;
    this.rotation = data[2];
  };

  return Map;
});
