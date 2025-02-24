import { Container, Sprite, Assets, Spritesheet } from 'pixi.js';

export default class Map extends Container {
  constructor(data) {
    super();

    async function loadAssets(url) {
      return await Assets.load(url);
    }

    // если статические данные
    if (data.type === 'static') {
      this._sheet = loadAssets(`/img/${data.spriteSheet.img}`);

      // data состоит из:
      // layer - слой,
      // tiles - массив с названиями тайлов,
      // spriteSheet - объект с данными картинки (например, PIXI.Spritesheet),
      // map - двумерный массив карты,
      // step - размер шага.
      this._map = data.map;
      this._tiles = data.tiles;
      this._spriteSheet = data.spriteSheet;
      this._step = data.step;
      this.layer = data.layer || 1;
      this.createStatic();
    }
    // если динамические данные
    else if (data.type === 'dynamic') {
      this._sheet = loadAssets(`/img/${data.img}`);

      this._rotation = data.angle;
      this._width = data.width;
      this._height = data.height;
      this._x = data.position[0] - this.width / 2;
      this._y = data.position[1] - this.height / 2;
      this._layer = data.layer || 2;
      this.createDynamic();
    }
  }

  async createDynamic() {
    const baseTexture = await this._sheet;
    baseTexture.dynamic = true;

    const sprite = new Sprite(baseTexture);

    sprite.x = this._x;
    sprite.y = this._y;
    sprite.width = this._width;
    sprite.height = this._height;
    sprite.rotation = this._rotation;
    sprite.anchor.set(0.5);
    this.addChild(sprite);
  }

  async createStatic() {
    const framesData = {};

    this._spriteSheet.frames.forEach((frame, index) => {
      const [x, y, width, height] = frame;

      framesData[`frame${index}`] = {
        frame: { x, y, w: width, h: height },
      };
    });

    // полная структура JSON для спрайт-листа
    const sheetData = {
      frames: framesData,
      meta: {
        scale: '1',
      },
    };

    const baseTexture = await this._sheet;
    const spriteSheet = new Spritesheet(baseTexture, sheetData);
    await spriteSheet.parse();

    for (let y = 0, lenY = this._map.length; y < lenY; y += 1) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
        const tile = this._map[y][x];

        // если название тайла содержится в списке тайлов
        if (this._tiles.indexOf(tile) !== -1) {
          // предполагается, что spriteSheet имеет свойство textures,
          // где ключ соответствует названию тайла
          const texture = spriteSheet.textures[`frame${tile}`];

          if (texture) {
            const sprite = new Sprite(texture);
            sprite.x = x * this._step;
            sprite.y = y * this._step;
            sprite.anchor.set(0.5);
            this.addChild(sprite);
          }
        }
      }
    }
  }

  update(data) {
    // data: [positionX, positionY, rotation]
    this.x = data[0] - this.width / 2;
    this.y = data[1] - this.height / 2;
    this.rotation = data[2];
  }
}
