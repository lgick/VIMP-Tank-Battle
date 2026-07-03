import { roundTo2Decimals } from '../../lib/formatters.js';
import { Vec2 } from '../../lib/vec2.js';
import RAPIER from '../physics/rapier.js';

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

    // вектор луча длиной range (direction мутируется — итоговый импульс
    // пропорционален range; поведение сохранено с planck-версии)
    const rayVector = direction.mul(range);

    // конечная точка луча при промахе
    const endPointRay = Vec2.add(startPoint, rayVector);

    // ближайшее пересечение; сенсоры исключаются
    const ray = new RAPIER.Ray(startPoint, rayVector);
    const hit = this._world.castRay(
      ray,
      1.0, // maxToi = 1: длина луча задана самим rayVector
      true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );

    const wasHit = hit !== null;
    let actualImpactPoint = null;

    if (wasHit) {
      actualImpactPoint = ray.pointAt(hit.timeOfImpact);

      const hitBody = hit.collider.parent();
      const hitUserData = hitBody?.userData;

      // если тело динамическое, то применение физического импульса
      if (impulseMagnitude > 0 && hitBody?.isDynamic()) {
        const impulseVector = rayVector.clone().mul(impulseMagnitude);

        hitBody.applyImpulseAtPoint(impulseVector, actualImpactPoint, true);
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

    // данные для отображения трассера; shooterId нужен стрелку
    // для подавления дубля локально предсказанного выстрела (Фаза 5c)
    return [
      roundTo2Decimals(startPoint.x),
      roundTo2Decimals(startPoint.y),
      endPoint.x,
      endPoint.y,
      roundTo2Decimals(bodyPosition.x),
      roundTo2Decimals(bodyPosition.y),
      wasHit,
      Number(gameId),
    ];
  }
}

export default HitscanService;
