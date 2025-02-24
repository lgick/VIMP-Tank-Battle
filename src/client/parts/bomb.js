import * as PIXI from 'pixi.js';

export default class Bomb extends PIXI.Container {
  constructor(params) {
    super();
    this.initialize(params);
  }

  initialize(params) {
    this.layer = 2;

    // Создаем графический объект для тела бомбы
    this.body = new PIXI.Graphics();

    // Создаем текст с указанными стилями
    this.text = new PIXI.Text('', {
      fontFamily: 'Arial',
      fontSize: 10,
      fill: '#ff3300',
    });
    this.text.x = -12;
    this.text.y = -5;

    // Добавляем объекты в контейнер
    this.addChild(this.body, this.text);

    // Устанавливаем координаты и начальное время
    this.x = params[0];
    this.y = params[1];
    this.time = params[2];
    this.text.text = this.time;
    this.rotation = 0;

    // Используем глобальный PIXI.Ticker для обновления времени
    // Накопление времени для вызова обновления каждую секунду
    this._accumulatedTime = 0;
    PIXI.Ticker.shared.add(this.updateTime, this);

    this.create();
  }

  updateTime() {
    if (this.time > 0) {
      // PIXI.Ticker.shared.elapsedMS возвращает прошедшее время в миллисекундах с прошлого кадра
      this._accumulatedTime += PIXI.Ticker.shared.elapsedMS;

      if (this._accumulatedTime >= 1000) {
        this._accumulatedTime -= 1000;
        this.time--;

        let hours = Math.floor(this.time / 3600);
        let minutes = Math.floor((this.time - hours * 3600) / 60);
        let seconds = this.time - hours * 3600 - minutes * 60;

        if (hours < 10) hours = '0' + hours;
        if (minutes < 10) minutes = '0' + minutes;
        if (seconds < 10) seconds = '0' + seconds;

        this.text.text = `${minutes}:${seconds}`;
      }
    }
  }

  create() {
    this.body.clear();
    // Задаем стиль линии (цвет #333333)
    this.body.lineStyle(1, 0x333333);
    // Заливаем цвет (#275C2D) и рисуем закругленный прямоугольник
    this.body.beginFill(0x275c2d);
    this.body.drawRoundedRect(-15, -15, 30, 30, 3);
    this.body.endFill();
  }

  update() {
    // Дополнительная логика обновления при необходимости
  }
}
