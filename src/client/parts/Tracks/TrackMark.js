import { Graphics, Ticker } from 'pixi.js';

export default class TrackMark extends Graphics {
  constructor(
    x,
    y,
    rotation,
    width,
    length,
    color,
    initialAlpha,
    effectsLayer,
  ) {
    super();

    this.x = x;
    this.y = y;
    this.rotation = rotation;
    this._initialAlpha = initialAlpha;

    // сегмент следа
    this.rect(-length / 2, -width / 2, length, width);
    this.fill(color);
    this.alpha = this._initialAlpha;

    effectsLayer.addChild(this); // добавление на указанный слой

    this._elapsedTime = 0;

    // время в ms, за которое сегмент следа полностью исчезнет
    // рандомность, чтобы следы исчезали не все одновременно
    this._fadeDuration = 1800 + Math.random() * 700;

    this._fadeListener = ticker => this.fadeOut(ticker.deltaMS);
    Ticker.shared.add(this._fadeListener);
  }

  fadeOut(deltaMS) {
    this._elapsedTime += deltaMS;
    const progress = Math.min(this._elapsedTime / this._fadeDuration, 1);

    // альфа изменяется от сохраненной начальной альфы до 0
    this.alpha = (1 - progress) * this._initialAlpha;

    if (progress >= 1) {
      this.destroy();
    }
  }

  destroy() {
    if (this._fadeListener) {
      Ticker.shared.remove(this._fadeListener);
      this._fadeListener = null;
    }

    super.destroy({ children: true });
  }
}
