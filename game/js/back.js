define(['createjs'], function (createjs) {
  var Shape = createjs.Shape
    , p;

  function Back(params) {
    if (typeof params === 'object') {
      this.initialize(params);
    }
  }

  p = Back.prototype = new Shape();
  p.Shape_initialize = p.initialize;

  // инициализация
  p.initialize = function (params) {
    this.Shape_initialize();

    this.x = 0;
    this.y = 0;

    // величина шага
    this._stepX = params.imgWidth;
    this._stepY = params.imgHeight;

    // изображение
    this._i = params.image;

    // размеры картинки
    this._w = params.width + (this._stepX * 4);
    this._h = params.height + (this._stepY * 4);

    // смещение координат
    this._x = -this._stepX;
    this._y = -this._stepY;

    this.create();
  };

  // создание фона,
  // изменение параметров фона
  // (например при ресайзе: длины и ширины)
  p.create = function (p) {
    var g = this.graphics;

    if (typeof p === 'object') {
      this._stepX = p.imgWidth ?
                    p.imgWidth :
                    this._stepX;

      this._stepY = p.imgHeight ?
                    p.imgHeight :
                    this._stepY;

      this._i = p.image ?
                p.image :
                this._i;

      this._w = p.width ?
                p.width + (this._stepX * 4) :
                this._w;

      this._h = p.height ?
                p.height + (this._stepY * 4) :
                this._h;

      this._x = -this._stepX || this._x;
      this._y = -this._stepY || this._y;
    }

    g.clear();

    g.beginBitmapFill(this._i);
    g.drawRect(this._x, this._y, this._w, this._h);
  };

  // обновляет координаты
  p.update = function (data) {
    var x = data.x
      , y = data.y
      , s = data.scale
      , nX, nY;

    nX = (this.x - x * s) % this._stepX;
    nY = (this.y - y * s) % this._stepY;

    // устранение неточности
    this.x = +(nX).toFixed(10);
    this.y = +(nY).toFixed(10);
  };

  return Back;
});
