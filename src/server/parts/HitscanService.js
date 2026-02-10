import { Vec2 } from 'planck';
import { roundTo1Decimal, roundTo2Decimals } from '../../lib/formatters.js';

class HitscanService {
  constructor(data) {
    // Убрана проверка "if (hitscanService) return..."
    // Теперь Factory будет всегда создавать новый экземпляр при перезапуске игры,
    // что гарантирует использование актуального data.world.

    this._world = data.world;
    this._weapons = data.weapons;
    this._game = data.game;
  }

  // обработка hitscan-выстрела
  processShot(params) {
    const {
      gameId, // id стреляющего
      weaponName, // имя оружия
      startPoint, // точка начала
      direction, // вектор направления
      bodyPosition,
    } = params;

    const weaponConfig = this._weapons[weaponName];
    const range = weaponConfig.range || 1000;
    const impulseMagnitude = weaponConfig.impulseMagnitude || 0;

    // конечная точка луча
    const endPointRay = Vec2.add(startPoint, direction.mul(range));

    let closestHitFixture = null;
    let hitPoint = null;
    let closestFraction = 1.0;

    this._world.rayCast(
      startPoint,
      endPointRay,
      (fixture, point, _normal, fraction) => {
        // Игнорируем сенсоры (зоны подбора и т.д.)
        if (fixture.isSensor()) {
          return -1.0;
        }

        closestHitFixture = fixture;
        hitPoint = point.clone();
        closestFraction = fraction;

        return fraction;
      },
    );

    let actualImpactPoint = null;
    // fraction < 1.0 означает, что луч во что-то уперся раньше конца
    const wasHit = closestHitFixture !== null && closestFraction < 1.0;

    if (wasHit) {
      actualImpactPoint = hitPoint;
      const hitBody = closestHitFixture.getBody();
      const hitUserData = hitBody.getUserData();

      // применение импульса к динамическим телам
      if (impulseMagnitude > 0 && hitBody.isDynamic()) {
        const impulseVector = direction.mul(impulseMagnitude);
        hitBody.applyLinearImpulse(impulseVector, hitPoint, true);
      }

      // нанесение урона (делегируется в Game)
      if (hitUserData && hitUserData.type === 'player') {
        this._game.applyDamage(hitUserData.gameId, gameId, weaponName);
      }
    }

    const endPoint = actualImpactPoint
      ? {
          x: roundTo1Decimal(actualImpactPoint.x),
          y: roundTo1Decimal(actualImpactPoint.y),
        }
      : {
          x: roundTo1Decimal(endPointRay.x),
          y: roundTo1Decimal(endPointRay.y),
        };

    // возвращаем данные для отрисовки трассера
    return [
      roundTo2Decimals(startPoint.x),
      roundTo2Decimals(startPoint.y),
      endPoint.x,
      endPoint.y,
      roundTo2Decimals(bodyPosition.x),
      roundTo2Decimals(bodyPosition.y),
      wasHit,
    ];
  }
}

export default HitscanService;
