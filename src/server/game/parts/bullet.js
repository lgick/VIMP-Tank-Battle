import { CircleShape } from 'planck';

class Bullet {
  constructor(data) {
    this._weaponData = data.weaponData;
    this._shotData = data.shotData;

    // Извлекаем необходимые параметры
    this._vX = data.shotData[2];
    this._vY = data.shotData[3];
    this._angle = data.shotData[4];

    const width = this._weaponData.width;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: this._shotData.position,
      angle: this._angle,
      // Дополнительно можно указать velocity, если это нужно
    });

    // линейная скорость
    this._body.setLinearVelocity(this._shotData.velocity);

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
    const { width, height, time } = this._weaponData;
    const { x: vX, y: vY } = this._shotData.velocity;

    return [
      Math.round(pos.x),
      Math.round(pos.y),
      this._body.getAngle(),
      width,
      height,
      time,
      [Math.round(vX), Math.round(vY)],
    ];
  }

  update(data, cb) {}
}

export default Bullet;
