import * as PIXI from 'pixi.js';

export default class Map extends PIXI.Container {
  constructor(data) {
    super();

    // В данном случае статические данные (карта, спрайт-лист и шаг) берутся из статических свойств класса.
    // Перед использованием необходимо установить:
    // Map.map — двумерный массив карты,
    // Map.spriteSheet — объект PIXI.Spritesheet с текстурами,
    // Map.step — размер шага.
    this._map = Map.map;
    this._spriteSheet = Map.spriteSheet;
    this._step = Map.step;

    this.zIndex = data.layer || 1;
    this._tiles = data.tiles; // Массив с названиями тайлов, которые нужно отрисовать

    this.create();
  }

  create() {
    for (let y = 0, lenY = this._map.length; y < lenY; y++) {
      for (let x = 0, lenX = this._map[y].length; x < lenX; x++) {
        const tile = this._map[y][x];

        if (this._tiles.indexOf(tile) !== -1) {
          // Получаем текстуру из spriteSheet по имени тайла.
          const texture = this._spriteSheet.textures[tile];
          if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.x = x * this._step;
            sprite.y = y * this._step;
            // В CreateJS использовался метод gotoAndStop для выбора кадра,
            // в PixiJS достаточно создать спрайт с нужной текстурой.
            this.addChild(sprite);
          }
        }
      }
    }
  }

  update() {
    // Дополнительная логика обновления при необходимости
  }
}
