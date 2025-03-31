import { BitmapText, Graphics, Ticker, Container } from 'pixi.js';

export default class Bomb extends Container {
  constructor(params) {
    super();

    this.zIndex = 1;

    this.body = new Graphics();

    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this._width = params[3];
    this._height = params[4];
    this._time = params[5] / 10;

    this.text = new BitmapText({
      style: {
        fontFamily: 'Arial',
        fontSize: 10,
        fill: 0xff1010,
        align: 'center',
      },
      width: this._width - 6,
    });

    this.text.text = '--:--';
    this.text.anchor.set(0.5);

    this._accumulatedTime = 0;

    Ticker.shared.add(this.updateTime, this);

    this.body
      .clear()
      .rect(
        -(this._width / 2),
        -(this._height / 2),
        this._width,
        this._height,
      )
      .fill(0xffffff)
      .rect(
        -(this._width / 2) + 1,
        -(this._height / 2) + 1,
        this._width - 2,
        this._height - 2,
      )
      .fill(0x275c2d);

    this.addChild(this.body, this.text);
  }

  updateTime() {
    let hours, minutes, seconds;

    if (this._time > 0) {
      this._accumulatedTime += Ticker.shared.elapsedMS;

      this._time -= 1;

      hours = Math.floor(this._time / 3600);
      minutes = Math.floor((this._time - hours * 3600) / 60);
      seconds = this._time - hours * 3600 - minutes * 60;

      if (hours < 10) {
        hours = '0' + hours;
      }

      if (minutes < 10) {
        minutes = '0' + minutes;
      }

      if (seconds < 10) {
        seconds = '0' + seconds;
      }

      this.text.text = `${minutes}:${seconds}`;
    }
  }

  update() {}
}
