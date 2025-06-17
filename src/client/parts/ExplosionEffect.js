import { Graphics, Ticker, Container } from 'pixi.js';

export default class Explosion extends Container {
  constructor(params) {
    super();

    this.zIndex = 2;

    this._durationMS = 400; // длительность анимации взрыва
    this._elapsedMS = 0;
    this._isStarted = false; // флаг для предотвращения повторного запуска

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    // [originX, originY, [[frag1X, frag1Y, frag1Hit], [frag2X, frag2Y, frag2Hit], ...]]
    this.x = params[0];
    this.y = params[1];

    this._fragments = [];
    const fragList = params[2];

    // разбираем массив данных об осколках
    for (const fragData of fragList) {
      this._fragments.push({
        endX: fragData[0],
        endY: fragData[1],
        wasHit: fragData[2],
      });
    }

    this._tickListener = null;
  }

  // запуск анимации взрыва
  run() {
    if (this._isDestroyed || this._isStarted) {
      return;
    }

    this._isStarted = true;

    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0); // отрисовываем первый кадр немедленно
  }

  // обновление анимации
  _update(deltaMS) {
    this._elapsedMS += deltaMS;
    const progress = Math.min(1, this._elapsedMS / this._durationMS);

    this._draw(progress);

    if (progress >= 1) {
      this.destroy();
    }
  }

  // отрисовка осколков
  _draw(progress) {
    this.graphics.clear();

    const alpha = 1.0 - progress; // эффект затухания

    for (const fragment of this._fragments) {
      // цвет осколка в зависимости от того, попал ли он
      const color = fragment.wasHit ? 0xff3333 : 0xffffff;

      // стиль обводки
      this.graphics.setStrokeStyle({ width: 2, color, alpha });

      // конечные координаты осколка относительно центра взрыва
      const relX = fragment.endX - this.x;
      const relY = fragment.endY - this.y;

      // геометрия (путь)
      this.graphics.moveTo(0, 0).lineTo(relX * progress, relY * progress);

      // команда нарисовать обводку
      this.graphics.stroke();
    }
  }

  // уничтожение объекта
  destroy(options) {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });
  }
}
