import { Graphics, Ticker, Container } from 'pixi.js';

export default class Pistol extends Container {
  constructor(params) {
    super();

    // Устанавливаем базовые параметры
    this.zIndex = 2;

    this.body = new Graphics();

    console.log(params);
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this._width = params[3];
    this._height = params[4];
    this._time = params[5] / 10;
    this.vX = params[6].x;
    this.vY = params[6].y;

    Ticker.shared.add(this.updateTime, this);

    this.body
      .clear()
      .circle(0, 0, this._width / 2)
      .fill(0xffffff)
      .circle(0, 0, this._width / 2 - 1)
      .fill(0x550000);

    this.addChild(this.body);
  }

  updateTime() {
    this.x += this.vX;
    this.y += this.vY;
  }

  update(x) {}
}
