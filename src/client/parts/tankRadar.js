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

    // масштаб
    this.scale.set(10, 10);

    // радиус круга
    this.radius = 6;

    this._teamID = data[8];

    this.create();
  }

  create() {
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

    this.body.clear();
    this.body.circle(0, 0, this.radius);
    this.body.fill(this.colorB);
    this.body.circle(0, 0, this.radius - 2);
    this.body.fill(this.colorA);
  }

  update(params) {
    this.x = params[0];
    this.y = params[1];
  }
}
