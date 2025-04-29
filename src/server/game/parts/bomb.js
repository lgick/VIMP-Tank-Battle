import { BoxShape } from 'planck';

class Bomb {
  constructor(data) {
    this._weaponData = data.weaponData;
    this._shotData = data.shotData;

    const width = this._weaponData.width;
    const height = this._weaponData.height;

    this._body = data.world.createBody({
      type: 'static',
      position: this._shotData.position,
      angle: 0,
    });

    this._body.createFixture(new BoxShape(width / 2, height / 2), {
      density: 20,
      isSensor: true, // фиксируем как сенсор, чтобы не было физического столкновения
    });
  }

  getBody() {
    return this._body;
  }

  getData() {
    const pos = this._body.getPosition();
    const { width, height, time } = this._weaponData;

    return [
      Math.round(pos.x),
      Math.round(pos.y),
      this._body.getAngle(),
      width,
      height,
      time,
    ];
  }

  update(data, cb) {}
}

export default Bomb;
