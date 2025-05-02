import { Container, Graphics } from 'pixi.js';

export default class Tank extends Container {
  constructor(data) {
    super();

    this.zIndex = 3;

    this.body = new Graphics();
    this.gun = new Graphics();

    // параметры с сервера: [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;
    this.gun.rotation = data[3] || 0;
    this._condition = data[6];
    this._size = data[7];

    // соотношение сторон танка: 4(width):3(height)
    this._width = this._size * 4;
    this._height = this._size * 3;

    this._teamID = data[8];

    // определение цветов в зависимости от типа
    if (this._teamID === 1) {
      this.colorA = 0xeeeeee;
      this.colorB = 0x552222;
    } else if (this._teamID === 2) {
      this.colorA = 0xeeeeee;
      this.colorB = 0x225522;
    } else {
      this.colorA = 0x000000;
      this.colorB = 0x333333;
    }

    this.create();
  }

  create() {
    this.removeChild(this.body);
    this.removeChild(this.gun);

    // тень танка
    if (this._condition === 0) {
    } else {
      // дым
      if (this._condition === 2) {
        // много дыма
      } else if (this._condition === 1) {
      }

      // рисование корпуса (body)
      // координаты танка на карте - центр его body
      this.body
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

      // рисование пушки
      // рассчитываем ЕДИНЫЙ коэффициент масштабирования.

      // первый полигон пушки (основание)
      this.gun
        .clear()
        .moveTo(1.33 * this._size, -0.42 * this._size)
        .lineTo(0.42 * this._size, -1 * this._size)
        .lineTo(-0.42 * this._size, -1 * this._size)
        .lineTo(-1.33 * this._size, -0.42 * this._size)
        .lineTo(-1.33 * this._size, 0.42 * this._size)
        .lineTo(-0.42 * this._size, 1 * this._size)
        .lineTo(0.42 * this._size, 1 * this._size)
        .lineTo(1.33 * this._size, 0.42 * this._size)
        .closePath()
        .fill(this.colorB)
        .stroke({ width: 0.17 * this._size, color: 0xaaaaaa })

        // второй полигон пушки (ствол)
        .moveTo(2.33 * this._size, -0.25 * this._size)
        .lineTo(0.25 * this._size, -0.25 * this._size)
        .lineTo(0.25 * this._size, 0.25 * this._size)
        .lineTo(2.33 * this._size, 0.25 * this._size)
        .closePath()
        .stroke({ width: 0.17 * this._size, color: 0xaaaaaa })
        .fill(this.colorB);

      this.addChild(this.body);
      this.addChild(this.gun);
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];
    this.rotation = data[2];
    this.gun.rotation = data[3];

    // если передан condition, пересоздаем графику
    if (data[6] !== this._condition) {
      this._condition = data[6];
      this.create();
    }
  }
}
