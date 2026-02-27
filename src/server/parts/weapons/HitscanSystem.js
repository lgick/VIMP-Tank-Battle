import { Vec2 } from 'planck';

export default class HitscanSystem {
  constructor(world) {
    this._world = world;

    // переменные для хранения состояния во время полета луча
    this._gameId = null;
    this._closestFraction = 1.0;
    this._closestFixture = null;
    this._closestPoint = new Vec2(0, 0);

    // предаллоцированные векторы для луча
    this._p1 = new Vec2(0, 0);
    this._p2 = new Vec2(0, 0);

    // объект результата
    this._result = {
      hit: false,
      point: new Vec2(0, 0),
      targetId: null,
    };

    this._rayCastCallback = this._rayCastCallback.bind(this);
  }

  // коллбэк движка planck.js
  // вызывается для каждого тела, через которое прошел луч
  _rayCastCallback(fixture, point, _normal, fraction) {
    const body = fixture.getBody();
    const userData = body.getUserData();

    // игнорирование сенсоров
    if (fixture.isSensor()) {
      return -1.0;
    }

    if (userData && userData.gameId === this._gameId) {
      return -1.0;
    }

    // если текущее попадание ближе, чем то, что было ранее
    if (fraction < this._closestFraction) {
      this._closestFraction = fraction;
      this._closestFixture = fixture;
      this._closestPoint.set(point);
    }

    return this._closestFraction;
  }

  // выполняет мгновенный выстрел лучом
  fire(shotData, config, gameId) {
    // сброс данных с прошлого выстрела
    this._gameId = gameId;
    this._closestFraction = 1.0;
    this._closestFixture = null;

    this._result.hit = false;
    this._result.targetId = null;

    // вычисление начальной и конечной точки луча
    const startX = shotData.position.x;
    const startY = shotData.position.y;

    const endX = startX + Math.cos(shotData.angle) * config.range;
    const endY = startY + Math.sin(shotData.angle) * config.range;

    // обновление предаллоцированных векторов
    this._p1.set(startX, startY);
    this._p2.set(endX, endY);

    // луч в физический мир
    this._world.rayCast(this._p1, this._p2, this._rayCastCallback);

    // если луч во что-то врезался (стена, танк, другой объект)
    if (this._closestFixture) {
      this._result.hit = true;
      this._result.point.set(this._closestPoint);

      const userData = this._closestFixture.getBody().getUserData();

      // если у объекта есть userData и это игрок
      if (userData && userData.type === 'player') {
        this._result.targetId = userData.gameId;
      }
    }

    return this._result;
  }
}
