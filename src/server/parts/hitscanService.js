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

        // если сам стрелок
        // -1.0 - игнорировать эту фикстуру и продолжить луч
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

        // Если это попадание ближе, чем предыдущие найденные
        // Мы не присваиваем здесь closestHitFixture и т.д. сразу,
        // а просто возвращаем fraction. RayCast сам найдет ближайшее.
        // Коллбэк будет вызван для *каждого* пересечения, но мы хотим только ближайшее.
        // Planck.js rayCast вызывает коллбэк для каждого пересечения.
        // Если коллбэк возвращает:
        //   -1: луч игнорирует эту фикстуру и продолжает.
        //    0: луч останавливается на этой фикстуре (считается ближайшим попаданием).
        // fraction (0 < f <= 1): луч продолжается, но только до этой точки (maxFraction для следующих проверок).
        //    1: луч продолжается без изменений (если fraction = 1, это конец луча или фикстура не меняет его).
        // Чтобы найти ближайшее, мы должны обновлять closestFraction и данные о попадании.
        // Однако, стандартный коллбэк Planck.js уже делает это за нас, если мы возвращаем fraction.
        // Нам нужно сохранить данные о *последнем* вызове коллбэка, где fraction был наименьшим.
        // Проще всего, если сам rayCast вернет ближайшее попадание.
        // Нет, Planck.js world.rayCast вызывает callback для каждого пересечения.
        // Нам нужно самим отслеживать ближайшее.

        // обновляем, если это ближайшее попадание
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

    return {
      weaponName,
      ownerGameID: shooterGameID,
      startPoint: { x: +startPoint.x.toFixed(1), y: +startPoint.y.toFixed(1) },
      endPoint: actualImpactPoint // если промах, то actualImpactPoint будет null, нужно endPointRay
        ? {
            x: +actualImpactPoint.x.toFixed(1),
            y: +actualImpactPoint.y.toFixed(1),
          }
        : { x: +endPointRay.x.toFixed(1), y: +endPointRay.y.toFixed(1) },
      impactPoint: actualImpactPoint // точка попадания (если hit: true)
        ? {
            x: +actualImpactPoint.x.toFixed(1),
            y: +actualImpactPoint.y.toFixed(1),
          }
        : null,
      hit: wasHit,
      target: hitTargetInfo, // информация о цели (если hit: true)
      damage: wasHit ? weaponConfig.damage || 0 : 0, // урон только при попадании (если hit: true)
      clientEffect: weaponConfig.clientEffect || null, // конфигурация эффекта для клиента
    };
  }
}

export default HitscanService;
