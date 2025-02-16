import planck from 'planck';

class Map {
  constructor(data) {
    // Функция глубокого копирования массива
    const deepCopy = arr => (Array.isArray(arr) ? arr.map(deepCopy) : arr);

    this._mapData = data.mapData;
    this._world = data.world;

    this._map = deepCopy(this._mapData.map);
    this._step = this._mapData.step;
    this._physicsStatic = this._mapData.physicsStatic || [];
    this._physicsDynamic = this._mapData.physicsDynamic || [];
    this._frames = this._mapData.spriteSheet.frames;

    this._dynamicBodies = {};

    this.createStatic();
    this.createDynamic();
  }

  // Ищет прямоугольные области для статических тел
  searchStaticBlock(y0, x0) {
    let y = y0;
    let x = x0;
    let wCounter = 0;
    let hCounter = 1;
    let lenX;
    let lenY;
    let emptyTile;

    // Определяем ширину блока
    while (this._physicsStatic.indexOf(this._map[y0][x]) !== -1) {
      this._map[y0][x] = null;
      x += 1;
      wCounter += 1;
    }

    lenX = x;

    // Определяем высоту блока
    for (y = y0 + 1, lenY = this._map.length; y < lenY; y += 1) {
      emptyTile = false;
      x = x0;

      // Проверка наличия статического элемента в ряду
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
        // Обнуляем обработанные ячейки
        while (x < lenX) {
          this._map[y][x] = null;
          x += 1;
        }
      }
    }

    return [wCounter * this._step, hCounter * this._step];
  }

  // Создает статические элементы карты
  createStatic() {
    for (let y = 0, lenY = this._map.length; y < lenY; y += 1) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
        const tile = this._map[y][x];

        // Если найден статический элемент
        if (this._physicsStatic.indexOf(tile) !== -1) {
          const sizes = this.searchStaticBlock(y, x);
          const posX = x * this._step + sizes[0] / 2;
          const posY = y * this._step + sizes[1] / 2;

          // Создаем статическое тело через world.createBody
          const body = this._world.createBody({
            type: 'static',
            position: { x: posX, y: posY },
          });

          // Добавляем fixture в виде прямоугольника.
          // В конструкторе Box указываются половинные размеры.
          body.createFixture(new planck.BoxShape(sizes[0] / 2, sizes[1] / 2));
        }
      }
    }
  }

  // Создает динамические элементы карты
  createDynamic() {
    for (let i = 0, len = this._physicsDynamic.length; i < len; i += 1) {
      const data = this._physicsDynamic[i];

      const body = this._world.createBody({
        type: 'dynamic',
        position: { x: data.position[0], y: data.position[1] },
        angle: data.angle,
      });

      // Сохраняем исходные данные для возможного сброса
      body.defaultPosition = data.position.slice();
      body.defaultAngle = data.angle;

      body.createFixture(new planck.BoxShape(data.width / 2, data.height / 2), {
        density: data.mass,
      });

      this._dynamicBodies['d' + i] = body;
    }
  }

  // Удаляет все динамические элементы из мира
  removeDynamic() {
    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        this._world.destroyBody(this._dynamicBodies[id]);
        delete this._dynamicBodies[id];
      }
    }
  }

  // Возвращает данные для всех динамических элементов карты
  getFullDynamicMapData() {
    return this.getDynamicMapData();
  }

  // Возвращает краткие данные динамических элементов
  getDynamicMapData() {
    const data = {};

    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        const body = this._dynamicBodies[id];
        const pos = body.getPosition();
        data[id] = [
          ~~pos.x.toFixed(2),
          ~~pos.y.toFixed(2),
          ~~body.getAngle().toFixed(2),
        ];
      }
    }

    return data;
  }

  // Сбрасывает динамические элементы к их исходным данным
  resetDynamic() {
    for (const id in this._dynamicBodies) {
      if (this._dynamicBodies.hasOwnProperty(id)) {
        const body = this._dynamicBodies[id];
        const pos = body.defaultPosition;
        body.setPosition({ x: pos[0], y: pos[1] });
        body.setAngle(body.defaultAngle);
      }
    }
  }
}

export default Map;
