import { Vec2 } from 'planck';

// Singleton HitscanService

let hitscanService;

class HitscanService {
  constructor(data) {
    if (hitscanService) {
      return hitscanService;
    }

    hitscanService = this;

    this._world = data.world;
    this._weapons = data.weapons;
    this._game = data.game;
  }

  // обработка hitscan-выстрела
  processShot(params) {
    const {
      gameId, // id стреляющего
      weaponName, // имя оружия из weaponsConfig
      startPoint, // мировая точка начала луча (например, дуло оружия)
      direction, // нормализованный мировой вектор направления луча
      bodyPosition,
    } = params;

    const weaponConfig = this._weapons[weaponName];
    const range = weaponConfig.range || 1000; // дальность

    // величина импульса
    const impulseMagnitude = weaponConfig.impulseMagnitude || 0;

    // конечная точка луча
    const endPointRay = Vec2.add(startPoint, direction.mul(range));

    let closestHitFixture = null;
    let hitPoint = null;
    let closestFraction = 1.0; // отслеживание ближайшего попадания

    this._world.rayCast(
      startPoint,
      endPointRay,
      (fixture, point, _normal, fraction) => {
        if (fixture.isSensor()) {
          return -1.0;
        }

        closestHitFixture = fixture; // сохраняем фикстуру, в которую попали
        hitPoint = point.clone();
        closestFraction = fraction; // новая максимальная доля для луча

        // продолжить луч, но искать пересечения только до этой точки
        return fraction;
      },
    );

    let actualImpactPoint = null;
    // попадание, если fraction < 1.0
    const wasHit = closestHitFixture !== null && closestFraction < 1.0;

    if (wasHit) {
      actualImpactPoint = hitPoint; // ближайшая точка попадания
      const hitBody = closestHitFixture.getBody();
      const hitUserData = hitBody.getUserData();

      // если тело динамическое, то применение физического импульса
      if (impulseMagnitude > 0 && hitBody.isDynamic()) {
        const impulseVector = direction.mul(impulseMagnitude);

        hitBody.applyLinearImpulse(impulseVector, hitPoint, true);
      }

      if (hitUserData && hitUserData.type === 'player') {
        this._game.applyDamage(hitUserData.gameId, gameId, weaponName);
      }
    }

    const endPoint = actualImpactPoint
      ? {
          x: +actualImpactPoint.x.toFixed(1),
          y: +actualImpactPoint.y.toFixed(1),
        }
      : { x: +endPointRay.x.toFixed(1), y: +endPointRay.y.toFixed(1) };

    // данные для отображения трассера
    return [
      +startPoint.x.toFixed(1),
      +startPoint.y.toFixed(1),
      +endPoint.x,
      +endPoint.y,
      +bodyPosition.x.toFixed(1),
      +bodyPosition.y.toFixed(1),
      wasHit,
    ];
  }
}

export default HitscanService;
