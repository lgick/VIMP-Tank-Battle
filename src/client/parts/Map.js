import { Container, Sprite, Assets, Spritesheet } from 'pixi.js';

export default class Map extends Container {
  constructor(data) {
    super();

    // хранение Promise, который возвращает Assets.load()
    this._baseTexturePromise = null;
    this._assetUrl = null; // URL для возможной выгрузки

    this.sprite = null;

    // если статические данные
    if (data.type === 'static') {
      this._assetUrl = `/img/${data.spriteSheet.img}`;
      this._baseTexturePromise = Assets.load(this._assetUrl);

      // data состоит из:
      // layer - слой,
      // tiles - массив с названиями тайлов,
      // spriteSheet - объект с данными картинки (например, PIXI.Spritesheet),
      // map - двумерный массив карты,
      // step - размер шага.
      this._map = data.map;
      this._tiles = data.tiles;
      this._spriteSheetData = data.spriteSheet;
      this._step = data.step;
      this.zIndex = data.layer || 1;

      this.createStatic();
    }
    // если динамические данные
    else if (data.type === 'dynamic') {
      this._assetUrl = `/img/${data.img}`;
      this._baseTexturePromise = Assets.load(this._assetUrl);

      this.zIndex = data.layer || 2;
      this._rotation = (data.angle * Math.PI) / 180;
      this._width = data.width;
      this._height = data.height;
      this._x = data.position[0];
      this._y = data.position[1];

      this.createDynamic();
    }
  }

  async createDynamic() {
    try {
      const baseTexture = await this._baseTexturePromise;

      this.sprite = new Sprite(baseTexture);

      this.sprite.x = this._x;
      this.sprite.y = this._y;
      this.sprite.width = this._width;
      this.sprite.height = this._height;
      this.sprite.rotation = this._rotation;
      this.addChild(this.sprite);
    } catch (error) {
      console.error(
        `Failed to create dynamic map with asset ${this._assetUrl}:`,
        error,
      );
    }
  }

  async createStatic() {
    try {
      const framesData = {};

      this._spriteSheetData.frames.forEach((frameDef, index) => {
        const [x, y, width, height] = frameDef;

        framesData[`frame${index}`] = {
          frame: { x, y, w: width, h: height },
        };
      });

      // полная структура JSON для спрайт-листа
      const sheetDataForPixi = {
        frames: framesData,
        meta: {
          scale: '1', // масштаб спрайтшита
        },
      };

      const baseTexture = await this._baseTexturePromise;
      const spriteSheet = new Spritesheet(baseTexture, sheetDataForPixi);
      await spriteSheet.parse();

      for (let y = 0, lenY = this._map.length; y < lenY; y += 1) {
        for (let x = 0, lenX = this._map[y].length; x < lenX; x += 1) {
          const tileIndex = this._map[y][x];

          if (this._tiles.includes(tileIndex)) {
            // предполагается, что spriteSheet имеет свойство textures,
            // где ключ соответствует названию тайла
            const textureName = `frame${tileIndex}`;
            const texture = spriteSheet.textures[textureName];

            if (texture) {
              const sprite = new Sprite(texture);
              sprite.x = x * this._step;
              sprite.y = y * this._step;
              this.addChild(sprite);
            } else {
              console.warn(
                `Texture not found in spritesheet: ${textureName} for tile index ${tileIndex}`,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error(
        `Failed to create static map with asset ${this._assetUrl}:`,
        error,
      );
    }
  }

  update(data) {
    if (this.sprite) {
      this.sprite.x = data[0];
      this.sprite.y = data[1];
      this.sprite.rotation = data[2];
    }
  }

  destroy(options) {
    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });

    // если текстуры были загружены через Assets.load и больше не нужны глобально,
    // их следует выгрузить из кеша Assets.
    if (this._assetUrl) {
      if (Assets.cache.has(this._assetUrl)) {
        Assets.unload(this._assetUrl).catch(err =>
          console.warn(
            `Failed to unload asset ${this._assetUrl} (was in cache):`,
            err,
          ),
        );
      }
    }

    // обнуление ссылок
    this.sprite = null;
    this._baseTexturePromise = null;
    this._assetUrl = null;
    this._map = null;
    this._tiles = null;
    this._spriteSheetData = null;
  }
}
