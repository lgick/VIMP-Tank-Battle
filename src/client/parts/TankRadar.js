import { Container, Graphics } from 'pixi.js';

export default class TankRadar extends Container {
  constructor(data) {
    super();

    this.zIndex = 2;

    this.body = new Graphics();
    this.addChild(this.body);

    // параметры с сервера: [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this._condition = data[6];

    // масштаб
    this.scale.set(10, 10);

    // радиус круга
    this.radius = 6;

    // толщина линий креста
    this.crossThickness = 1.5;

    this._teamID = data[8];

    this.create();
  }

  create() {
    this.body.clear();

    // если танк уничтожен
    if (this._condition === 0) {
      const size = this.radius * 1.5; // размер креста
      const halfSize = size / 2;

      // рисуем две пересекающиеся линии
      this.body
        .moveTo(-halfSize, -halfSize)
        .lineTo(halfSize, halfSize)
        .moveTo(-halfSize, halfSize)
        .lineTo(halfSize, -halfSize)
        .stroke({ width: this.crossThickness, color: 0x333333 });
    } else {
      // определение цветов в зависимости от типа
      if (this._teamID === 1) {
        this.colorA = 0x552222;
        this.colorB = 0xeeeeee;
      } else if (this._teamID === 2) {
        this.colorA = 0x225522;
        this.colorB = 0xeeeeee;
      } else {
        this.colorA = 0x000000;
        this.colorB = 0x333333;
      }

      this.body.circle(0, 0, this.radius);
      this.body.fill(this.colorB);
      this.body.circle(0, 0, this.radius - 2);
      this.body.fill(this.colorA);
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];

    const newCondition = data[6];
    const needsVisualChange = (this._condition === 0) !== (newCondition === 0);

    this._condition = newCondition;

    // если визуальное представление требуется изменить
    if (needsVisualChange) {
      this.create();
    }
  }

  destroy(options) {
    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });

    this.body = null;
  }
}
