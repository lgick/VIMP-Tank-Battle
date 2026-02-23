import { Vec2 } from 'planck';
import { randomRange } from '../../lib/formatters.js';

class HitscanService {
  constructor(data) {
    this._world = data.world;
    this._weapons = data.weapons;
    this._game = data.game;

    this._pStart = new Vec2(); // начало луча
    this._pEnd = new Vec2(); // конец луча (макс. дальность)
    this._hitPoint = new Vec2(); // точка попадания (результат)
    this._impulseVec = new Vec2(); // вектор импульса для физики
  }

  // обрабатывает hitscan-выстрел
  processShot(gameId, weaponName, shotData) {
    const { position, angle, tankWidth } = shotData;
    const weaponConfig = this._weapons[weaponName];
    const spread = weaponConfig.spread || 0;
    const range = weaponConfig.range || 1000;
    const impulseMagnitude = weaponConfig.impulseMagnitude || 0;

    // расчет угла с учетом разброса
    let finalAngle = angle;

    if (spread > 0) {
      finalAngle += randomRange(-spread, spread);
    }

    // тригонометрия (1 раз за выстрел)
    const cos = Math.cos(finalAngle);
    const sin = Math.sin(finalAngle);

    // вычисление точек старта и конца
    // (дуло находится немного впереди центра танка)
    const muzzleOffset = tankWidth * 0.55;

    // start = center + offset * dir
    this._pStart.x = position.x + cos * muzzleOffset;
    this._pStart.y = position.y + sin * muzzleOffset;

    // end = start + range * dir
    this._pEnd.x = this._pStart.x + cos * range;
    this._pEnd.y = this._pStart.y + sin * range;

    let closestFixture = null;
    let closestFraction = 1.0;

    this._world.rayCast(
      this._pStart,
      this._pEnd,
      (fixture, point, _normal, fraction) => {
        if (fixture.isSensor()) {
          return -1;
        }

        // если дальше уже найденного, то игнор
        if (fraction > closestFraction) {
          return -1;
        }

        // новое ближайшее препятствие
        closestFraction = fraction;
        closestFixture = fixture;
        this._hitPoint.set(point.x, point.y);

        // обрезка луча до новой точки
        return fraction;
      },
    );

    const wasHit = closestFixture !== null; // попадание
    let visEndX, visEndY; // визуальный конец трассера

    if (wasHit) {
      visEndX = this._hitPoint.x;
      visEndY = this._hitPoint.y;

      const hitBody = closestFixture.getBody();

      // физический импульс (отталкивание)
      if (impulseMagnitude > 0 && hitBody.isDynamic()) {
        this._impulseVec.set(cos * impulseMagnitude, sin * impulseMagnitude);
        hitBody.applyLinearImpulse(this._impulseVec, this._hitPoint, true);
      }

      const userData = hitBody.getUserData();

      if (userData && userData.type === 'player') {
        this._game.applyDamage(userData.gameId, gameId, weaponName);
      }
      // иначе, если промах, трассер летит на максимальную дальность
    } else {
      visEndX = this._pEnd.x;
      visEndY = this._pEnd.y;
    }

    // данные для отрисовки трассера (ArrayBuffer)
    return [
      this._pStart.x,
      this._pStart.y,
      visEndX,
      visEndY,
      position.x,
      position.y,
      wasHit ? 1 : 0,
    ];
  }
}

export default HitscanService;
