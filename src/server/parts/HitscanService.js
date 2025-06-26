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
      shooterBody, // тело стреляющего
      shooterGameID, // ID игрока, совершившего выстрел
      shooterTeamID, // команда игрока для фильтрации при friendlyFire === true
      weaponName, // имя оружия из weaponsConfig
      startPoint, // мировая точка начала луча (например, дуло оружия)
      direction, // нормализованный мировой вектор направления луча
      filters = {},
    } = params;

    const weaponConfig = this._weapons[weaponName];
    const range = weaponConfig.range || 1000; // дальность
    const impulseMagnitude = weaponConfig.impulseMagnitude || 0; // величина импульса

    const endPointRay = Vec2.add(startPoint, direction.mul(range)); // конечная точка луча

    let closestHitFixture = null;
    let hitPoint = null;
    let closestFraction = 1.0; // отслеживание ближайшего попадания

    this._world.rayCast(
      startPoint,
      endPointRay,
      (fixture, point, normal, fraction) => {
        const body = fixture.getBody();

        // если сам стрелок, игнорировать эту фикстуру и продолжить луч
        if (body === shooterBody) {
          return -1.0;
        }

        closestHitFixture = fixture; // сохраняем фикстуру, в которую попали
        hitPoint = point.clone();
        closestFraction = fraction; // устанавливаем новую максимальную долю для луча

        return fraction; // продолжить луч, но искать пересечения только до этой точки
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
        this._game.applyDamage(
          hitUserData.gameID,
          hitUserData.teamID,
          weaponName,
          shooterTeamID,
        );
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
      wasHit,
    ];
  }
}

export default HitscanService;
