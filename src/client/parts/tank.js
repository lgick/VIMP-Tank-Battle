import { Container, Graphics } from 'pixi.js';

export default class Tank extends Container {
  constructor(data) {
    super();

    this.zIndex = 2;

    this.body = new Graphics();
    this.gun = new Graphics();

    // Параметры с сервера: [x, y, rotation, gunRotation, type, name, width, height]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;
    this.gun.rotation = data[3] || 0;
    this.label = data[5];
    this._width = data[6];
    this._height = data[7];

    this.create(data[4]);
  }

  create(type) {
    // определение цветов в зависимости от типа
    if (type === 1) {
      this.colorA = 0xeeeeee;
      this.colorB = 0x552222;
    } else if (type === 2) {
      this.colorA = 0xeeeeee;
      this.colorB = 0x225522;
    } else {
      this.colorA = 0x000000;
      this.colorB = 0x333333;
    }

    // Рисование корпуса (body)
    // Координаты танка на карте - центр его body
    this.body
      .clear()
      .rect(
        -(this._width / 2),
        -(this._height / 2),
        this._width,
        this._height,
      )
      .fill(0x555555)
      .rect(
        -(this._width / 2) + 1,
        -(this._height / 2) + 1,
        this._width - 2,
        this._height - 2,
      )
      .fill(0x999999)
      .rect(
        -(this._width / 2) + 2,
        -(this._height / 2) + 2,
        this._width - 4,
        this._height - 4,
      )
      .fill(0xcccccc)
      .rect(
        -(this._width / 2) + 3,
        -(this._height / 2) + 3,
        this._width - 6,
        this._height - 6,
      )
      .fill(this.colorA);

    // Первый полигон пушки
    this.gun
      .clear()
      .moveTo(16, -5)
      .lineTo(5, -12)
      .lineTo(-5, -12)
      .lineTo(-16, -5)
      .lineTo(-16, 5)
      .lineTo(-5, 12)
      .lineTo(5, 12)
      .lineTo(16, 5)
      .closePath()
      .fill(this.colorB)
      .stroke({ width: 2, color: 0xaaaaaa })

      // Второй полигон пушки
      .moveTo(28, -3)
      .lineTo(3, -3)
      .lineTo(3, 3)
      .lineTo(28, 3)
      .closePath()
      .stroke({ width: 2, color: 0xaaaaaa })
      .fill(this.colorB);

    this.addChild(this.body);
    this.addChild(this.gun);
  }

  update(params) {
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this.gun.rotation = params[3];

    // Если передан тип, пересоздаем графику
    if (typeof params[4] === 'number') {
      this.create(params[4]);
    }
  }
}
