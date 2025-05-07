import { Graphics, Ticker, Container } from 'pixi.js';

export default class Bullet extends Container {
  constructor(params) {
    super();

    this.zIndex = 2;

    this.body = new Graphics();

    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this._size = params[3];
    this._maxLifetime = params[4];
    this.vX = params[5][0];
    this.vY = params[5][1];

    this._radius = this._size / 2;
    this._currentLifetime = 0; // счетчик времени жизни

    this._tickListener = ticker => this._updateMovement(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);

    this.body
      .clear()
      .circle(0, 0, this._radius) // внешний белый круг (контур)
      .fill(0xffffff)
      .circle(0, 0, this._radius - 1) // внутренний темно-красный круг
      .fill(0x550000);

    this.addChild(this.body);
  }

  _updateMovement(deltaMS) {
    // перевод deltaMS в секунды для расчетов скорости
    const deltaTime = deltaMS / 1000.0;

    this.x += this.vX * deltaTime;
    this.y += this.vY * deltaTime;

    // время жизни
    this._currentLifetime += deltaMS;

    // если время вышло, уничтожаем объект
    if (this._currentLifetime >= this._maxLifetime) {
      this._stopTimer();
      this.body.clear(); // удаление пули с полотна
    }
  }

  // обновляет данные
  // тут приходят координаты столкновения, нужно отобразить анимацию столкновения
  update(data) {
    //const x = data[0];
    //const y = data[1];
  }

  _stopTimer() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
  }

  destroy(options) {
    this._stopTimer();

    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });

    this.body = null;
  }
}
