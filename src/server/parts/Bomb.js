import { BoxShape, Vec2, AABB } from 'planck';

class Bomb {
  constructor(data) {
    this._weaponData = data.weaponData;
    this._shotData = data.shotData;

    const size = this._weaponData.size;

    this._body = data.world.createBody({
      type: 'static',
      position: this._shotData.position,
      angle: 0,
    });

    this._body.createFixture(new BoxShape(size / 2, size / 2), {
      density: 20,
      isSensor: true, // фиксируем как сенсор, чтобы не было физического столкновения
    });

    this._body.setUserData(data.userData);
  }

  // выполняет детонацию, находит цели, применяет урон/импульс и возвращает данные для клиента
  detonate(world, game, friendlyFire) {
    const bombPosition = this._body.getPosition();
    const shooterData = this._body.getUserData();
    const radius = this._weaponData.radius;
    const damage = this._weaponData.damage;
    const impulseMagnitude = this._weaponData.impulseMagnitude;
    const weaponName = shooterData.weaponName;

    const explosionAABB = new AABB(
      new Vec2(bombPosition.x - radius, bombPosition.y - radius),
      new Vec2(bombPosition.x + radius, bombPosition.y + radius),
    );

    const potentialTargets = new Set(); // используем Set, чтобы избежать дублирования целей

    // поиск всех тел в радиусе взрыва (первичный фильтр)
    world.queryAABB(explosionAABB, fixture => {
      const body = fixture.getBody();
      const userData = body.getUserData();

      // игнорируем саму бомбу, статичные объекты и все, у чего нет типа
      if (body === this._body || !body.isDynamic() || !userData?.type) {
        return true;
      }

      // любой динамический объект в радиусе является потенциальной целью
      const distance = Vec2.distance(bombPosition, body.getPosition());

      if (distance < radius) {
        potentialTargets.add({ body, userData, distance });
      }

      return true; // продолжаем поиск
    });

    // 2. Проверка линии видимости и применение урона и импульса
    for (const target of potentialTargets) {
      const { body: targetBody, userData: targetUserData, distance } = target;
      let firstHit = null;

      // Пускаем луч от бомбы к цели, чтобы проверить наличие препятствий
      world.rayCast(
        bombPosition,
        targetBody.getPosition(),
        (fixture, point, normal, fraction) => {
          const currentHitBody = fixture.getBody();

          // Игнорируем саму бомбу, так как луч начинается внутри нее
          if (currentHitBody === this._body) {
            return -1.0; // Проигнорировать это столкновение и продолжить луч
          }

          // Сохраняем первое тело и точку столкновения, в которые попал луч, и останавливаем его
          firstHit = { body: currentHitBody, point };
          return fraction; // Остановить луч на этом столкновении
        },
      );

      // Если первое тело, в которое попал луч, - это наша цель, значит, линия видимости чиста
      if (firstHit && firstHit.body === targetBody) {
        // урон и импульс линейно затухают с расстоянием
        const falloff = 1 - distance / radius;
        const actualDamage = Math.round(damage * falloff);
        const actualImpulse = impulseMagnitude * falloff;

        // применяем урон только к игрокам
        if (targetUserData.type === 'player') {
          // проверка на дружественный огонь
          if (friendlyFire || shooterData.teamID !== targetUserData.teamID) {
            game.applyDamage(
              targetUserData.gameID,
              targetUserData.teamID,
              weaponName,
              shooterData.teamID,
            );
          }
        }

        // применяем импульс
        const direction = Vec2.sub(targetBody.getPosition(), bombPosition);
        direction.normalize();
        const impulseVector = direction.mul(actualImpulse);
        targetBody.applyLinearImpulse(
          impulseVector,
          firstHit.point, // применяем импульс к точке столкновения для создания вращения
          true,
        );
      }
    }

    // 3. Формирование данных для визуализации взрыва на клиенте (логика остается прежней)
    const explosionData = [
      +bombPosition.x.toFixed(1),
      +bombPosition.y.toFixed(1),
      [],
    ];
    const fragmentCount = 16; // количество "осколков" для анимации

    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * 2 * Math.PI;
      const direction = new Vec2(Math.cos(angle), Math.sin(angle));
      const endPointRay = Vec2.add(bombPosition, direction.mul(radius));

      let hitPoint = endPointRay;
      let wasHit = false;

      world.rayCast(bombPosition, endPointRay, (fixture, point, normal) => {
        const body = fixture.getBody();

        // луч не должен сталкиваться с самой бомбой
        if (body === this._body) {
          return -1.0; // игнорировать и продолжить
        }

        hitPoint = point;
        // отмечаем попадание, если это был любой динамический объект (для визуализации)
        if (body.isDynamic() && body.getUserData()?.type) {
          wasHit = true;
        }

        // Останавливаем луч на первом же препятствии
        return 0;
      });

      explosionData[2].push([
        +hitPoint.x.toFixed(1),
        +hitPoint.y.toFixed(1),
        wasHit,
      ]);
    }

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
