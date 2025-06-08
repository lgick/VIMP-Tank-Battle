import { Container, Graphics } from 'pixi.js';

export default class Tank extends Container {
  constructor(data) {
    super();

    this.zIndex = 3;

    this.body = new Graphics();
    this.gun = new Graphics();

    this.addChild(this.body, this.gun);

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
    this.body.clear();
    this.gun.clear();

    // если танк уничтожен
    if (this._condition === 0) {
      const bodyColorDark = 0x3a3a3a;
      const bodyColorDarker = 0x252525;
      const gunColorDark = 0x303030;
      const damageColor = 0x181818;
      const edgeColor = 0x505050;

      const w = this._width;
      const h = this._height;
      const s = this._size;

      // поврежденный корпус
      this.body
        .moveTo(-w / 2 - s * 0.1, -h / 2 + s * 0.2)
        .lineTo(w / 2 + s * 0.2, -h / 2 - s * 0.1)
        .lineTo(w / 2 - s * 0.1, h / 2 + s * 0.3)
        .lineTo(-w / 2 + s * 0.3, h / 2 - s * 0.2)
        .closePath()
        .fill(bodyColorDark)
        .stroke({ width: s * 0.2, color: edgeColor, alignment: 0.5 });

      // тень/выгоревшая область
      this.body
        .moveTo(-w / 2 + s * 0.4, -h / 2 + s * 0.5)
        .lineTo(w / 2 - s * 0.3, -h / 2 + s * 0.2)
        .lineTo(w / 2 - s * 0.4, h / 2 - s * 0.1)
        .lineTo(-w / 2 + s * 0.2, h / 2 - s * 0.4)
        .closePath()
        .fill(bodyColorDarker);

      // пробоины на корпусе
      this.body.circle(w * 0.15, h * 0.1, s * 1.2).fill(damageColor);
      this.body.circle(-w * 0.3, -h * 0.25, s * 0.5).fill(damageColor);

      // небольшое случайное смещение башни от центра
      const randomOffsetX = s * 0.3;
      const randomOffsetY = -s * 0.2;
      this.gun.position.set(randomOffsetX, randomOffsetY);

      // основание башни (искаженное)
      const gunBasePoints = [
        s * 1.1,
        -s * 0.7,
        s * 0.2,
        -s * 1.0,
        -s * 0.6,
        -s * 0.9,
        -s * 1.3,
        -s * 0.2,
        -s * 1.1,
        s * 0.6,
        -s * 0.2,
        s * 1.0,
        s * 0.7,
        s * 0.8,
        s * 1.3,
        s * 0.1,
      ];

      this.gun
        .poly(gunBasePoints)
        .fill(gunColorDark)
        .stroke({ width: s * 0.15, color: edgeColor, alignment: 0 });

      // обломок ствола
      const barrelPoints = [
        s * 0.8,
        -s * 0.25,
        s * 1.5,
        -s * 0.4,
        s * 1.4,
        s * 0.15,
        s * 0.7,
        s * 0.05,
      ];

      this.gun
        .poly(barrelPoints)
        .fill(gunColorDark)
        .stroke({ width: s * 0.1, color: edgeColor, alignment: 0 });

      // пробоина на башне
      this.gun.circle(s * 0.1, -s * 0.2, s * 0.4).fill(damageColor);
    } else {
      // сбрасывание позиции пушки на центр
      this.gun.position.set(0, 0);

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
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];
    this.rotation = data[2];
    this.gun.rotation = data[3];

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
    this.gun = null;
  }
}
