import { roundTo2Decimals } from '../../lib/formatters.js';
import { Vec2 } from '../../lib/vec2.js';
import RAPIER from '../physics/rapier.js';

class Bomb {
  constructor(data) {
    this._weaponData = data.weaponData;

    const size = this._weaponData.size;

    this._body = data.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(
        data.position.x,
        data.position.y,
      ),
    );

    // сенсор: детектирует контакты, но не участвует в столкновениях;
    // события контактов собирает Game (для не-explosive снарядов в будущем)
    data.world.createCollider(
      RAPIER.ColliderDesc.cuboid(size / 2, size / 2)
        .setSensor(true)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      this._body,
    );

    this._body.userData = data.userData;
  }

  // выполняет детонацию, находит цели,
  // применяет урон/импульс и возвращает данные для клиента
  detonate(world, game, friendlyFire) {
    const bombPosition = this._body.translation();
    const shooterData = this._body.userData;
    const radius = this._weaponData.radius;
    const damage = this._weaponData.damage;
    const impulseMagnitude = this._weaponData.impulseMagnitude;
    const weaponName = shooterData.weaponName;

    const potentialTargets = new Set();

    // 1. Находим все потенциальные цели в радиусе взрыва
    world.collidersWithAabbIntersectingAabb(
      bombPosition,
      { x: radius, y: radius },
      collider => {
        const body = collider.parent();
        const userData = body?.userData;

        if (
          !body ||
          body === this._body ||
          !body.isDynamic() ||
          !userData?.type
        ) {
          return true;
        }

        const distance = Vec2.distance(bombPosition, body.translation());

        if (distance < radius) {
          potentialTargets.add({ body, userData, distance });
        }
        return true;
      },
    );

    // 2. Для каждой цели применяем урон без проверки линии видимости
    for (const target of potentialTargets) {
      const { body: targetBody, userData: targetUserData, distance } = target;

      // Рассчитываем и применяем урон и импульс для всех в радиусе
      const falloff = 1 - distance / radius;
      const actualDamage = Math.round(damage * falloff);
      const actualImpulse = impulseMagnitude * falloff;

      if (targetUserData.type === 'player') {
        if (friendlyFire || shooterData.teamId !== targetUserData.teamId) {
          game.applyDamage(
            targetUserData.gameId,
            shooterData.gameId,
            weaponName,
            actualDamage,
          );
        }
      }

      if (actualImpulse > 0 && distance > 0) {
        const direction = Vec2.sub(targetBody.translation(), bombPosition);
        direction.normalize();
        const impulseVector = direction.mul(actualImpulse);
        targetBody.applyImpulseAtPoint(
          impulseVector,
          targetBody.translation(),
          true,
        );
      }
    }

    // 3. Формирование данных для визуализации взрыва на клиенте
    const explosionData = [
      +bombPosition.x.toFixed(1),
      +bombPosition.y.toFixed(1),
      radius,
    ];

    return explosionData;
  }

  getBody() {
    return this._body;
  }

  getData() {
    const pos = this._body.translation();
    const { size, time } = this._weaponData;

    // ownerId нужен владельцу для remap на локально предсказанную бомбу
    return [
      roundTo2Decimals(pos.x),
      roundTo2Decimals(pos.y),
      roundTo2Decimals(this._body.rotation()),
      size,
      time,
      Number(this._body.userData.gameId),
    ];
  }

  update() {}
}

export default Bomb;
