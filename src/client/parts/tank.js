import * as PIXI from 'pixi.js';

export default class Tank extends PIXI.Container {
  constructor(params) {
    super();

    this.layer = 2;

    // Создаем графические объекты для корпуса и пушки
    this.body = new PIXI.Graphics();
    this.gun = new PIXI.Graphics();

    this.addChild(this.body, this.gun);

    // Параметры с сервера: [x, y, rotation, gunRotation, type, name]
    this.x = params[0] || 0;
    this.y = params[1] || 0;
    this.rotation = params[2] || 0;
    this.gun.rotation = params[3] || 0;
    this.name = params[5];

    // Рисуем танк с учетом типа (params[4])
    this.create(params[4]);
  }

  create(type) {
    // Определение цветов в зависимости от типа
    if (type === 1) {
      this.colorA = '#eee';
      this.colorB = '#522';
    } else if (type === 2) {
      this.colorA = '#eee';
      this.colorB = '#252';
    } else {
      this.colorA = '#000';
      this.colorB = '#333';
    }

    // Для корректной работы beginFill в PIXI, преобразуем строку цвета в число.
    const fillColorA = PIXI.utils.string2hex(this.colorA);
    const fillColorB = PIXI.utils.string2hex(this.colorB);

    // Рисование корпуса (body)
    this.body.clear();
    this.body.lineStyle(1, 0x333333);
    this.body.beginFill(fillColorA);
    this.body.moveTo(22, -18);
    this.body.lineTo(-26, -18);
    this.body.lineTo(-26, 18);
    this.body.lineTo(22, 18);
    this.body.closePath();

    // Рисование пушки (gun)
    this.gun.clear();
    // Первый полигон пушки
    this.gun.lineStyle(1, 0xcccccc);
    this.gun.beginFill(fillColorB);
    this.gun.moveTo(16, -5);
    this.gun.lineTo(5, -12);
    this.gun.lineTo(-5, -12);
    this.gun.lineTo(-16, -5);
    this.gun.lineTo(-16, 5);
    this.gun.lineTo(-5, 12);
    this.gun.lineTo(5, 12);
    this.gun.lineTo(16, 5);
    this.gun.closePath();

    // Второй полигон пушки
    this.gun.lineStyle(1, 0xcccccc);
    this.gun.beginFill(fillColorB);
    this.gun.moveTo(28, -3);
    this.gun.lineTo(3, -3);
    this.gun.lineTo(3, 3);
    this.gun.lineTo(28, 3);
    this.gun.closePath();
  }

  update(params) {
    // Обновляем позицию, вращение корпуса и пушки
    this.x = params[0];
    this.y = params[1];
    this.rotation = params[2];
    this.gun.rotation = params[3];

    // Если передан тип, пересоздаем танк с новыми параметрами
    if (typeof params[4] === 'number') {
      this.create(params[4]);
    }
  }
}
