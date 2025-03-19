import { Container, Graphics } from 'pixi.js';

export default class MapRadar extends Container {
  constructor(data) {
    super();

    // сохраняем необходимые данные для схематичной карты
    this._map = data.map;
    this._physicsStatic = data.physicsStatic;
    this._step = data.step;
    this.zIndex = 2;

    // масштаб
    this.scale.set(1, 1);

    // создаем схематичную карту
    this.createRadarMap();
  }

  createRadarMap() {
    // создаем графический объект для рисования
    const graphics = new Graphics();

    if (Array.isArray(this._map)) {
      for (let y = 0; y < this._map.length; y += 1) {
        const row = this._map[y];
        if (Array.isArray(row)) {
          for (let x = 0; x < row.length; x += 1) {
            const tileType = row[x];

            // проверяем, является ли текущий тайл препятствием (physicsStatic)
            if (this._physicsStatic.includes(tileType)) {
              graphics.rect(
                x * this._step,
                y * this._step,
                this._step / 2,
                this._step / 2,
              );
              graphics.fill(0xffffff);
            }
          }
        }
      }
    }

    // добавляем графику в контейнер
    this.addChild(graphics);
  }

  update() {}
}
