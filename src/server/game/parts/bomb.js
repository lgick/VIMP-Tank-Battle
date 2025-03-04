import { BoxShape, Vec2 } from 'planck';

class Bomb {
  constructor(data) {
    this._bulletSet = data.bulletSet;
    this._bulletData = data.bulletData;
    this._time = data.bulletSet.time;
    this._body = null;

    const width = this._bulletSet.width;
    const height = this._bulletSet.height;

    this._body = data.world.createBody({
      type: 'static',
      position: this._bulletData.position,
      angle: 0,
    });

    this._body.createFixture(
      new BoxShape(width / 2, height / 2),
      this._bulletSet.density,
    );
  }

  getBody() {
    return this._body;
  }

  getData() {
    const pos = this._body.getPosition();
    const { width, height, time } = this._bulletSet;

    return [pos.x, pos.y, this._body.getAngle(), width, height, time];
  }

  update(data, cb) {}
}

export default Bomb;
