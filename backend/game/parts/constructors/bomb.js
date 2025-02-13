import planck from 'planck';

class Bomb {
  constructor(data) {
    const bulletSet = data.bulletSet;
    const bulletData = data.bulletData;

    this._time = bulletSet.time;

    this._body = new planck.Body({
      mass: bulletSet.mass || 20,
      position: [bulletData[0], bulletData[1]],
      angle: bulletData[4],
      velocity: [0, 0],
      force: [0, 0],
      angularVelocity: 0,
    });

    this._body.addShape(
      new planck.Circle({
        width: bulletSet.width,
        height: bulletSet.height,
      }),
    );
  }

  // возвращает тело модели
  getBody() {
    return this._body;
  }

  // возвращает данные
  getData() {
    const body = this._body;

    return [].concat(
      ~~body.position[0].toFixed(2),
      ~~body.position[1].toFixed(2),
      this._time,
    );
  }

  // обновляет данные
  update(data, cb) {}
}
export default Bomb;
