import { Vec2, Rot } from 'planck';

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
    this._friendlyFire = data.friendlyFire;
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
      filters = {}, // опциональные фильтры для raycast
    } = params;

    const weaponConfig = this._weapons[weaponName];

    const range = weaponConfig.range || 1000; // дальность
    const endPointRay = Vec2.add(startPoint, direction.mul(range)); // конечная точка луча

    let closestHitFixture = null;
    let hitPoint = null;
    let hitNormal = null;
    let closestFraction = 1.0; // отслеживание ближайшего попадания

    this._world.rayCast(
      startPoint,
      endPointRay,
      (fixture, point, normal, fraction) => {
        const body = fixture.getBody();
        // { type: 'player', gameID: 'p1', teamID: 'blue', ... }
        // { type: 'wall', id: 'wall_segment_5', ... }
        // { type: 'projectile', objectID: 'proj_abc', ownerGameID: 'p2', ... }
        const userData = body.getUserData();

        // если сам стрелок, игнорировать эту фикстуру и продолжить луч
        if (body === shooterBody) {
          return -1.0;
        }

        // фильтр по типам сущностей, которые нужно игнорировать
        if (
          this._friendlyFire === false &&
          userData &&
          filters.ignoreEntityTypes.includes(userData.type)
        ) {
          return -1.0;
        }

        // фильтр по команде (если включен и данные есть)
        if (
          filters.ignoreShooterTeam &&
          shooterTeamID &&
          userData &&
          userData.type === 'player' &&
          userData.teamID === shooterTeamID
        ) {
          return -1.0;
        }

        closestHitFixture = fixture; // сохраняем последнюю фикстуру, в которую попали
        hitPoint = point.clone();
        hitNormal = normal.clone();
        closestFraction = fraction; // устанавливаем новую максимальную долю для луча

        return fraction; // продолжить луч, но искать пересечения только до этой точки
      },
    );

    let hitTargetInfo = null;
    let actualImpactPoint = null;
    const wasHit = closestHitFixture !== null && closestFraction < 1.0; // попадание, если fraction < 1.0

    if (wasHit) {
      actualImpactPoint = hitPoint; // ближайшая точка попадания
      const hitBody = closestHitFixture.getBody();
      const hitUserData = hitBody.getUserData();

      hitTargetInfo = {
        type: hitUserData ? hitUserData.type : 'static_obstacle',
        id:
          hitUserData && (hitUserData.gameID || hitUserData.objectID)
            ? hitUserData.gameID || hitUserData.objectID
            : null,
      };
    }

    // если промах, то actualImpactPoint будет null, нужно endPointRay
    const endPoint = actualImpactPoint
      ? {
          x: +actualImpactPoint.x.toFixed(1),
          y: +actualImpactPoint.y.toFixed(1),
        }
      : { x: +endPointRay.x.toFixed(1), y: +endPointRay.y.toFixed(1) };

    return [
      +startPoint.x.toFixed(1),
      +startPoint.y.toFixed(1),
      +endPoint.x,
      +endPoint.y,
    ];
  }
}

export default HitscanService;
