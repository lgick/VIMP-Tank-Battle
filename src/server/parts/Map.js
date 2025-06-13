import { BoxShape, Vec2 } from 'planck';

// Singleton Map
let map;

class Map {
  constructor(world) {
    if (map) {
      return map;
    }

    map = this;

    this._world = world;

    this._mapData = null;
    this._map = null;
    this._step = null;
    this._physicsStatic = [];
    this._physicsDynamic = [];
    this._frames = null;

    this._staticBodies = []; // список bodies
    this._dynamicBodies = []; // список из элементов вида [id, body]
  }

  // создает карту
  createMap(mapData) {
    // функция глубокого копирования массива
    const deepCopy = arr => (Array.isArray(arr) ? arr.map(deepCopy) : arr);

    this._mapData = mapData;
    this._map = deepCopy(mapData.map);
    this._step = mapData.step;
    this._physicsStatic = mapData.physicsStatic || [];
    this._physicsDynamic = mapData.physicsDynamic || [];
    this._frames = mapData.spriteSheet.frames;

    // удаление старых данных, если они были загружены ранее
    this.destroyMap();

    this.createStatic();
    this.createDynamic();
  }

  // ищет прямоугольные области для статических тел
  searchStaticBlock(y0, x0) {
    let y = y0;
    let x = x0;
    let wCounter = 0;
    let hCounter = 1;
    let emptyTile;

    // определяем ширину блока
    while (this._physicsStatic.indexOf(this._map[y0][x]) !== -1) {
      this._map[y0][x] = null;
      x += 1;
      wCounter += 1;
    }

    const lenX = x;
    const lenY = this._map.length;

    // определяем высоту блока
    for (y = y0 + 1; y < lenY; y += 1) {
      emptyTile = false;
      x = x0;

      // проверка наличия статического элемента в ряду
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

        // обнуляем обработанные ячейки
        while (x < lenX) {
          this._map[y][x] = null;
          x += 1;
        }
      }
    }

    return [wCounter * this._step, hCounter * this._step];
  }

  // создает статические элементы карты
  createStatic() {
    for (let y = 0, lenY = this._map.length; y < lenY; y += 1) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
        const tile = this._map[y][x];

        // если найден статический элемент
        if (this._physicsStatic.indexOf(tile) !== -1) {
          const sizes = this.searchStaticBlock(y, x);
          const posX = x * this._step + sizes[0] / 2;
          const posY = y * this._step + sizes[1] / 2;

          // создаем статическое тело через world.createBody
          const body = this._world.createBody({
            type: 'static',
            position: new Vec2(posX, posY),
          });

          // добавляем fixture в виде прямоугольника.
          // в конструкторе Box указываются половинные размеры.
          body.createFixture(new BoxShape(sizes[0] / 2, sizes[1] / 2));

          this._staticBodies.push(body);
        }
      }
    }
  }

  // создает динамические элементы карты
  createDynamic() {
    for (let i = 0, len = this._physicsDynamic.length; i < len; i += 1) {
      const data = this._physicsDynamic[i];
      const angle = (data.angle * Math.PI) / 180;
      const posX = data.position[0];
      const posY = data.position[1];

      const body = this._world.createBody({
        type: 'dynamic',
        position: new Vec2(posX, posY),
        angle,
        linearDamping: 0,
        angularDamping: 0.01,
        allowSleep: true,
      });

      body.createFixture(
        new BoxShape(
          data.width / 2,
          data.height / 2,
          new Vec2(data.width / 2, data.height / 2),
        ),
        data.density,
      );

      this._dynamicBodies.push([`d${i}`, body]);
    }
  }

  // удаляет все динамические элементы из мира
  destroyMap() {
    while (this._staticBodies.length) {
      this._world.destroyBody(this._staticBodies.pop());
    }

    while (this._dynamicBodies.length) {
      this._world.destroyBody(this._dynamicBodies.pop()[1]);
    }
  }

  // возвращает краткие данные динамических элементов
  getDynamicMapData() {
    const data = {};

    for (let i = 0, len = this._dynamicBodies.length; i < len; i += 1) {
      const [id, body] = this._dynamicBodies[i];
      const pos = body.getPosition();

      data[id] = [
        Math.round(pos.x),
        Math.round(pos.y),
        +body.getAngle().toFixed(2),
      ];
    }

    return data;
  }
}

export default Map;
