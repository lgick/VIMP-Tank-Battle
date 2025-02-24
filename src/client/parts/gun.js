import * as PIXI from 'pixi.js';

export default class Gun extends PIXI.Graphics {
  constructor(params) {
    super();
    this.initialize(params);
  }

  initialize(params) {
    this.layer = 2;

    // Устанавливаем начальные координаты, скорость и вращение
    this.x = params[0];
    this.y = params[1];
    this.vX = params[2];
    this.vY = params[3];
    this.rotation = params[4];

    // Добавляем обновление позиции в каждый тик
    PIXI.Ticker.shared.add(this.updatePosition, this);

    this.create();
  }

  // Функция обновления позиции: добавляем скорость к координатам
  updatePosition() {
    this.x += this.vX;
    this.y += this.vY;
  }

  // Рисуем графический объект (красный круг с обводкой)
  create() {
    this.clear();
    this.lineStyle(1, 0x333333);
    this.beginFill(0xff0000);
    this.drawCircle(0, 0, 6);
    this.endFill();
  }

  update() {
    // Дополнительная логика обновления при необходимости
  }
}
