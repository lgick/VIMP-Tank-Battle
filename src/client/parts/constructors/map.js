import * as PIXI from 'pixi.js';

export default class Map extends PIXI.Container {
  constructor(data) {
    super();

    // Если статические данные
    if (data.type === 'static') {
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
    // Если динамические данные
    else if (data.type === 'dynamic') {
      // data: [src, position, rotation, width, height, layer]
      this.width = data.width;
      this.height = data.height;
      this.x = data.position[0] - this.width / 2;
      this.y = data.position[1] - this.height / 2;
      this.rotation = data.angle;
      this.layer = data.layer || 2;

      // Создаем спрайт на основе источника изображения
      const sprite = PIXI.Sprite.from(data.src);
      this.addChild(sprite);
    }
  }

  createStatic() {
    for (let y = 0, lenY = this._map.length; y < lenY; y++) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x++) {
        const tile = this._map[y][x];

        // Если название тайла содержится в списке тайлов
        if (this._tiles.indexOf(tile) !== -1) {
          // Предполагается, что spriteSheet имеет свойство textures,
          // где ключ соответствует названию тайла
          const texture = this._spriteSheet.textures[tile];
          if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.x = x * this._step;
            sprite.y = y * this._step;
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
