var p2 = require('p2');

// копирует массив данных
function copyArr(arr) {
  var out = []
    , i
    , len;

  if (Object.prototype.toString.call(arr) !== '[object Array]') {
    return arr;
  }

  for (i = 0, len = arr.length; i < len; i += 1) {
    out[i] = arguments.callee(arr[i]);
  }

  return out;
}

function Map(data) {
  this._mapData = data.mapData;
  this._world = data.world;

  this._map = copyArr(this._mapData.map);
  this._step = this._mapData.step;
  this._physicsStatic = this._mapData.physicsStatic || [];
  this._physicsDynamic = this._mapData.physicsDynamic || [];
  this._frames = this._mapData.spriteSheet.frames;

  this._dynamicBodies = {};

  this.createStatic();
  this.createDynamic();
}

// ищет прямоугольные области
Map.prototype.searchStaticBlock = function (y0, x0) {
  var y = y0
    , x = x0
    , wCounter = 0
    , hCounter = 1
    , lenX
    , lenY
    , emptyTile
  ;

  // поиск ширины блока
  while (this._physicsStatic.indexOf(this._map[y0][x]) !== -1) {
    this._map[y0][x] = null;
    x += 1;
    wCounter += 1;
  }

  lenX = x;

  // поиск высоты блока
  for (y = y0 + 1, lenY = this._map.length; y < lenY; y += 1) {
    emptyTile = false;
    x = x0;

    // поиск наличия пустого блока
    while (x < lenX) {
      if (this._physicsStatic.indexOf(this._map[y][x]) !== -1) {
        x += 1;
      } else {
        emptyTile = true;
        break;
      }
    }

    if (emptyTile === true) {
      break;
    } else {
      hCounter += 1;
      x = x0;

      // удаление данных в блоке
      while (x < lenX) {
        this._map[y][x] = null;
        x += 1;
      }
    }
  }

  return [wCounter * this._step, hCounter * this._step];
};

// создает статические элементы
Map.prototype.createStatic = function () {
  var sizes
    , x
    , y
    , lenY
    , lenX
    , tile
    , body
  ;

  for (y = 0, lenY = this._map.length; y < lenY; y += 1) {
    for (x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
      tile = this._map[y][x];

      // если есть среди статических тел
      if (this._physicsStatic.indexOf(tile) !== -1) {
        sizes = this.searchStaticBlock(y, x);

        body = new p2.Body({
          position: [x * this._step + sizes[0] / 2, y * this._step + sizes[1] / 2],
          type: p2.Body.STATIC
        });

        body.addShape(new p2.Box({
          width: sizes[0],
          height: sizes[1]
        }));

        this._world.addBody(body);
      }
    }
  }
};

// создает динамические элементы
Map.prototype.createDynamic = function () {
  var i = 0
    , len = this._physicsDynamic.length
    , data
    , body;

  for (; i < len; i += 1) {
    data = this._physicsDynamic[i];

    body = this._dynamicBodies['d' + i] = new p2.Body({
      mass: data.mass,
      position: data.position,
      angle: data.angle
    });

    body.defaultPosition = data.position;
    body.defaultAngle = data.angle;

    body.addShape(new p2.Box({
      width: data.width,
      height: data.height
    }));

    this._world.addBody(body);
  }
};

// удаляет динамические элементы
Map.prototype.removeDynamic = function () {
  var id;

  for (id in this._dynamicBodies) {
    if (this._dynamicBodies.hasOwnProperty(id)) {
      this._world.removeBody(this._dynamicBodies[id]);
      delete this._dynamicBodies[id];
    }
  }
};

// возвращает все данные динамических элементов
Map.prototype.getFullDynamicMapData = function () {
  return this.getDynamicMapData();
};

// возвращает данные динамических элементов
Map.prototype.getDynamicMapData = function () {
  var data = {}
    , body
    , id;

  for (id in this._dynamicBodies) {
    if (this._dynamicBodies.hasOwnProperty(id)) {
      body = this._dynamicBodies[id];

      data[id] = [
        ~~body.position[0].toFixed(2),
        ~~body.position[1].toFixed(2),
        ~~body.angle.toFixed(2)
      ];
    }
  }

  return data;
};

// сбрасывает динамические элементы в дефолтные данные
Map.prototype.resetDynamic = function () {
  var id
    , body
    , position;

  for (id in this._dynamicBodies) {
    if (this._dynamicBodies.hasOwnProperty(id)) {
      body = this._dynamicBodies[id];
      position = body.defaultPosition;
      body.position[0] = position[0];
      body.position[1] = position[1];
      body.angle = body.defaultAngle;
    }
  }
};

module.exports = Map;
