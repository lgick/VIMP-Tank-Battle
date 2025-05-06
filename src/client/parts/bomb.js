import { Text, Graphics, Ticker, Container } from 'pixi.js';

export default class Bomb extends Container {
  constructor(params) {
    super();

    this.zIndex = 2;

    this.body = new Graphics();

    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this._width = params[3];
    this._height = params[4];
    this._totalDurationMS = params[5];

    this.text = new Text({
      text: '--:--',
      style: {
        fontFamily: 'Arial',
        fontSize: 10,
        fill: 0xff1010,
        align: 'center',
      },
    });
    this.text.anchor.set(0.5);
    this.text.x = 0.5;
    this.text.y = 0;

    // накопленное время с момента создания
    this._accumulatedTimeMS = 0;

    this._drawBody();
    this.addChild(this.body, this.text);
    this._updateTimerDisplay(this._totalDurationMS);

    this._tickListener = ticker => this._updateTimer(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
  }

  _drawBody() {
    this.body
      .clear()
      // внешний контур (белый)
      .rect(-(this._width / 2), -(this._height / 2), this._width, this._height)
      .fill(0xffffff)
      // внутренняя часть (зеленая)
      .rect(
        -(this._width / 2) + 1,
        -(this._height / 2) + 1,
        this._width - 2,
        this._height - 2,
      )
      .fill(0x275c2d);
  }

  // обновление таймера
  // deltaMS - время в миллисекундах, прошедшее с прошлого кадра
  _updateTimer(deltaMS) {
    // накопление прошедшего времени
    this._accumulatedTimeMS += deltaMS;

    // вычисление оставшегося времени
    const remainingMS = Math.max(
      0,
      this._totalDurationMS - this._accumulatedTimeMS,
    );

    // обновление текста на экране
    this._updateTimerDisplay(remainingMS);

    // если вышло ли время, требуется завершить анимацию
    if (remainingMS <= 0) {
      this._stopTimer();
      this._updateTimerDisplay(0);
    }
  }

  // обновление текста таймера на основе оставшегося времени
  // remainingMS - оставшееся время в миллисекундах
  _updateTimerDisplay(remainingMS) {
    // определение количества целых секунд, оставшихся до конца
    const wholeSecondsLeft = Math.floor(remainingMS / 1000);

    // определение количества сотых долей секунды, оставшихся в текущей секунде
    const hundredthsLeftInSecond = Math.floor((remainingMS % 1000) / 10);

    // при remainingMS == 0, сотые тоже должны быть 0
    const displayHundredths = remainingMS <= 0 ? 0 : hundredthsLeftInSecond;

    // форматирование с ведущими нулями
    const secondsStr = String(wholeSecondsLeft).padStart(2, '0');
    const hundredthsStr = String(displayHundredths).padStart(2, '0');

    this.text.text = `${secondsStr}:${hundredthsStr}`;
  }

  update(data) {
    // удаление бомбы и анимация взрыва
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
    this.text = null;
  }
}
