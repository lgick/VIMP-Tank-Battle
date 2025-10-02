import { BoxShape, Vec2, AABB } from 'planck';

class Bomb {
  constructor(data) {
    this._weaponData = data.weaponData;

    const size = this._weaponData.size;

    this._body = data.world.createBody({
      type: 'static',
      position: data.position,
      angle: 0,
    });

    this._body.createFixture(new BoxShape(size / 2, size / 2), {
      isSensor: true,
    });

    this._body.setUserData(data.userData);
  }

  // выполняет детонацию, находит цели,
  // применяет урон/импульс и возвращает данные для клиента
  detonate(world, game, friendlyFire) {
    const bombPosition = this._body.getPosition();
    const shooterData = this._body.getUserData();
    const radius = this._weaponData.radius;
    const damage = this._weaponData.damage;
    const impulseMagnitude = this._weaponData.impulseMagnitude;
    const weaponName = shooterData.weaponName;

    const aabb = new AABB(
      new Vec2(bombPosition.x - radius, bombPosition.y - radius),
      new Vec2(bombPosition.x + radius, bombPosition.y + radius),
    );

    const potentialTargets = new Set();

    // 1. Находим все потенциальные цели в радиусе взрыва
    world.queryAABB(aabb, fixture => {
      const body = fixture.getBody();
      const userData = body.getUserData();

      if (body === this._body || !body.isDynamic() || !userData?.type) {
        return true;
      }

      const distance = Vec2.distance(bombPosition, body.getPosition());

      if (distance < radius) {
        potentialTargets.add({ body, userData, distance });
      }
      return true;
    });

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
        const direction = Vec2.sub(targetBody.getPosition(), bombPosition);
        direction.normalize();
        const impulseVector = direction.mul(actualImpulse);
        targetBody.applyLinearImpulse(
          impulseVector,
          targetBody.getPosition(),
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
    const pos = this._body.getPosition();
    const { size, time } = this._weaponData;

    return [
      Math.round(pos.x),
      Math.round(pos.y),
      this._body.getAngle(),
      size,
      time,
    ];
  }

  update() {}
}

export default Bomb;
