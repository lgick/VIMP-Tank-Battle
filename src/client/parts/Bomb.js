import { Text, Ticker, Container, Sprite } from 'pixi.js';

export default class Bomb extends Container {
  constructor(params, assets) {
    super();

    this.zIndex = 2;

    this.body = new Sprite(assets.bombTexture);
    this.body.anchor.set(0.5);

    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this._size = params[3]; // соотношение сторон 1:1
    this._totalDurationMs = params[4];

    // Масштабируем спрайт под нужный размер
    // предполагаем, что текстура квадратная
    const textureSize = assets.bombTexture.width;
    const scale = this._size / textureSize;
    this.body.scale.set(scale);

    this.text = new Text({
      text: '--:--',
      style: {
        fontFamily: 'Arial',
        fontSize: this._size / 3,
        fill: 0xff1010,
        align: 'center',
      },
    });

    this.text.anchor.set(0.5);
    this.text.x = 0; // центр текста относительно родительского контейнера
    this.text.y = 0;

    // накопленное время с момента создания
    this._accumulatedTimeMs = 0;

    this.addChild(this.body, this.text);
    this._updateTimerDisplay(this._totalDurationMs);

    this._tickListener = ticker => this._updateTimer(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
  }

  // обновление таймера
  // deltaMs - время в миллисекундах, прошедшее с прошлого кадра
  _updateTimer(deltaMs) {
    // накопление прошедшего времени
    this._accumulatedTimeMs += deltaMs;

    // вычисление оставшегося времени
    const remainingMs = Math.max(
      0,
      this._totalDurationMs - this._accumulatedTimeMs,
    );

    // обновление текста на экране
    this._updateTimerDisplay(remainingMs);

    // если вышло ли время, требуется завершить анимацию
    if (remainingMs <= 0) {
      this._stopTimer();
      this._updateTimerDisplay(0);
    }
  }

  // обновление текста таймера на основе оставшегося времени
  // remainingMs - оставшееся время в миллисекундах
  _updateTimerDisplay(remainingMs) {
    // определение количества целых секунд, оставшихся до конца
    const wholeSecondsLeft = Math.floor(remainingMs / 1000);

    // определение количества сотых долей секунды, оставшихся в текущей секунде
    const hundredthsLeftInSecond = Math.floor((remainingMs % 1000) / 10);

    // при remainingMs == 0, сотые тоже должны быть 0
    const displayHundredths = remainingMs <= 0 ? 0 : hundredthsLeftInSecond;

    // форматирование с ведущими нулями
    const secondsStr = String(wholeSecondsLeft).padStart(2, '0');
    const hundredthsStr = String(displayHundredths).padStart(2, '0');

    this.text.text = `${secondsStr}:${hundredthsStr}`;
  }

  update() {}

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
    this.text = null;
  }
}
