import { CircleShape } from 'planck';

class Bullet {
  constructor(data) {
    this._bulletSet = data.bulletSet;
    this._bulletData = data.bulletData;
    this._time = data.bulletSet.time;

    // Извлекаем необходимые параметры
    this._vX = data.bulletData[2];
    this._vY = data.bulletData[3];
    this._angle = data.bulletData[4];

    const width = this._bulletSet.width;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: this._bulletData.position,
      angle: this._angle,
      // Дополнительно можно указать velocity, если это нужно
    });

    // линейная скорость
    this._body.setLinearVelocity(this._bulletData.velocity);

    this._body.createFixture(new CircleShape(width / 2), {
      density: 200,
    });
  }

  // Возвращает тело модели
  getBody() {
    return this._body;
  }

  // Возвращает данные (например, позицию и скорость)
  getData() {
    const pos = this._body.getPosition();
    const { width, height, time } = this._bulletSet;

    return [
      pos.x,
      pos.y,
      this._body.getAngle(),
      width,
      height,
      time,
      this._bulletData.velocity,
    ];
  }

  update(data, cb) {}
}

export default Bullet;
