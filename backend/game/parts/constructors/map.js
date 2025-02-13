import planck from 'planck';

class Map {
  constructor(data) {
    // копирует массив данных
    function copyArr(arr) {
      let out = [];

      if (!Array.isArray(arr)) {
        return arr;
      }

      for (let i = 0, len = arr.length; i < len; i += 1) {
        out[i] = arguments.callee(arr[i]);
      }

      return out;
    }

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
  searchStaticBlock(y0, x0) {
    let y = y0;
    let x = x0;
    let wCounter = 0;
    let hCounter = 1;
    let lenX;
    let lenY;
    let emptyTile;

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
  }

  // создает статические элементы
  createStatic() {
    for (let y = 0, lenY = this._map.length; y < lenY; y += 1) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
        const tile = this._map[y][x];

        // если есть среди статических тел
        if (this._physicsStatic.indexOf(tile) !== -1) {
          const sizes = this.searchStaticBlock(y, x);

          const body = new planck.Body({
            position: [
              x * this._step + sizes[0] / 2,
              y * this._step + sizes[1] / 2,
            ],
            type: planck.Body.STATIC,
          });

          body.addShape(
            new planck.Box({
              width: sizes[0],
              height: sizes[1],
            }),
          );

          this._world.addBody(body);
        }
      }
    }
  }

  // создает динамические элементы
  createDynamic() {
    for (let i = 0, len = this._physicsDynamic.length; i < len; i += 1) {
      const data = this._physicsDynamic[i];

      const body = (this._dynamicBodies['d' + i] = new planck.Body({
        mass: data.mass,
        position: data.position,
        angle: data.angle,
      }));

      body.defaultPosition = data.position;
      body.defaultAngle = data.angle;

      body.addShape(
        new planck.Box({
          width: data.width,
          height: data.height,
        }),
      );

      this._world.addBody(body);
    }
  }

  // удаляет динамические элементы
  removeDynamic() {
    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        this._world.removeBody(this._dynamicBodies[id]);
        delete this._dynamicBodies[id];
      }
    }
  }

  // возвращает все данные динамических элементов
  getFullDynamicMapData() {
    return this.getDynamicMapData();
  }

  // возвращает данные динамических элементов
  getDynamicMapData() {
    const data = {};

    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        const body = this._dynamicBodies[id];

        data[id] = [
          ~~body.position[0].toFixed(2),
          ~~body.position[1].toFixed(2),
          ~~body.angle.toFixed(2),
        ];
      }
    }

    return data;
  }

  // сбрасывает динамические элементы в дефолтные данные
  resetDynamic() {
    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        const body = this._dynamicBodies[id];
        const position = body.defaultPosition;
        body.position[0] = position[0];
        body.position[1] = position[1];
        body.angle = body.defaultAngle;
      }
    }
  }
}

export default Map;
