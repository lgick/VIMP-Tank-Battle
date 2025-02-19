import * as PIXI from 'pixi.js';

export default class Pistol extends PIXI.Graphics {
  constructor(params) {
    super();
    this.initialize(params);
  }

  initialize(params) {
    // Устанавливаем базовые параметры
    this.layer = 2;
    this.x = params[0];
    this.y = params[1];
    this.vX = params[2];
    this.vY = params[3];
    this.rotation = params[4];

    // Используем PIXI.Ticker для обновления позиции каждый кадр
    PIXI.Ticker.shared.add(this.tick, this);

    this.create();
  }

  tick() {
    this.x += this.vX;
    this.y += this.vY;
  }

  create() {
    // Очищаем предыдущую графику
    this.clear();
    // Устанавливаем стиль линии: толщина 1, цвет белый
    this.lineStyle(1, PIXI.utils.string2hex('#fff'));
    // Устанавливаем заливку: цвет '#500'
    this.beginFill(PIXI.utils.string2hex('#500'));
    // Рисуем круг радиусом 2
    this.drawCircle(0, 0, 2);
    this.endFill();
  }

  update() {
    // Дополнительная логика обновления при необходимости
  }
}
