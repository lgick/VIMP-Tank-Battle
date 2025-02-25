import { Container, Graphics } from 'pixi.js';

export default class Radar extends Container {
  constructor(data) {
    super();

    this.layer = 2;

    this.body = new Graphics();

    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;

    // масштаб
    this.scale.set(20, 20);

    this.create(data[4]);
  }

  create(type) {
    // определение цветов в зависимости от типа
    if (type === 1) {
      this.colorA = 0x552222;
      this.colorB = 0xeeeeee;
    } else if (type === 2) {
      this.colorA = 0x225522;
      this.colorB = 0xeeeeee;
    } else {
      this.colorA = 0x000000;
      this.colorB = 0x333333;
    }

    this.body
      .clear()
      .moveTo(7, 0)
      .lineTo(-7, 5)
      .lineTo(-5, 0)
      .lineTo(-7, -5)
      .closePath()
      .fill(this.colorA)
      .stroke({ width: 1, color: this.colorB });
    this.addChild(this.body);
  }

  update(params) {
    // Обновляем позицию и вращение
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];

    // Если передан тип, пересоздаем графику
    if (typeof params[4] === 'number') {
      this.create(params[4]);
    }
  }
}
