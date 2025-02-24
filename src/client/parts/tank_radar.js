import * as PIXI from 'pixi.js';

// Предполагается, что класс Shadow уже импортирован или определён в вашем проекте.
// Если необходимо, импортируйте его, например:
// import Shadow from './Shadow';

export default class Radar extends PIXI.Graphics {
  constructor(params) {
    super();
    this.initialize(params);
  }

  initialize(params) {
    // Устанавливаем базовые параметры
    this.layer = 2;
    this.x = params[0] || 0;
    this.y = params[1] || 0;
    this.rotation = params[2] || 0;

    // В PixiJS масштаб задается через объект scale
    this.scale.set(20, 20);

    // Создаем тень (предполагается, что класс Shadow определён)
    this.shadow = new Shadow('#333', 2, 2, 3);

    // Создаем фигуру согласно типу (params[4])
    this.create(params[4]);
  }

  create(type) {
    // Определение цветов в зависимости от типа
    if (type === 1) {
      this.colorA = '#fff';
      this.colorB = '#333';
    } else if (type === 2) {
      this.colorA = '#eee';
      this.colorB = '#333';
    } else {
      this.colorA = '#000';
      this.colorB = '#333';
    }

    // Преобразуем CSS-цвета в числовой формат для PixiJS
    const hexColorA = PIXI.utils.string2hex(this.colorA);
    const hexColorB = PIXI.utils.string2hex(this.colorB);

    // Очищаем предыдущие графические команды
    this.clear();

    // Рисуем фигуру радара
    this.lineStyle(1, hexColorB);
    this.beginFill(hexColorA);
    this.moveTo(7, 0);
    this.lineTo(-7, 5);
    this.lineTo(-5, 0);
    this.lineTo(-7, -5);
    this.closePath();
    this.endFill();
  }

  update(params) {
    // Обновляем позицию и вращение
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];

    // Если передан тип, пересоздаем графику
    if (typeof params[4] === 'number') {
      this.create(params[4]);
    }
  }
}
