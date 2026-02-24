import { AABB, Vec2 } from 'planck';

export default class AoESystem {
  constructor(world) {
    this._world = world;
  }

  // находит цели в радиусе взрыва, применяет физический импульс
  // и возвращает массив задетых танков для нанесения урона
  process(pos, config) {
    const { radius, impulseMagnitude } = config;

    // квадратная зона поиска (AABB) вокруг эпицентра взрыва
    const aabb = new AABB(
      new Vec2(pos.x - radius, pos.y - radius),
      new Vec2(pos.x + radius, pos.y + radius),
    );

    const players = [];
    const projectiles = [];

    // защита от двойного урона, если у цели несколько фикстур
    const processedBodies = new Set();

    // поиск всех фикстур внутри AABB
    this._world.queryAABB(aabb, fixture => {
      const body = fixture.getBody();
      const userData = body.getUserData();

      // игнорирование, если нет userData и статики (стены)
      if (!userData || !body.isDynamic()) {
        return true;
      }

      // если эта цель уже обработана в этом взрыве
      if (processedBodies.has(body)) {
        return true;
      }

      const targetPos = body.getPosition();

      // реальная дистанция (AABB - это квадрат, а взрыв - круг)
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // если цель действительно находится в радиусе кругового взрыва
      if (distance <= radius) {
        processedBodies.add(body);

        const falloff = 1 - distance / radius; // чем дальше, тем слабее

        // применение физического импульса (взрывная волна расталкивает цели)
        if (impulseMagnitude && distance > 0) {
          const actualImpulse = impulseMagnitude * falloff;

          // нормализация вектора направления от эпицентра к танку
          const directionX = dx / distance;
          const directionY = dy / distance;

          const impulseVector = new Vec2(
            directionX * actualImpulse,
            directionY * actualImpulse,
          );

          // толчок цели в центр его массы
          body.applyLinearImpulse(impulseVector, body.getWorldCenter(), true);
        }

        // сохранение данных для дальнейших действий
        switch (userData.type) {
          case 'player':
            players.push({
              gameId: userData.gameId,
              falloff,
            });
            break;
          case 'shot':
            projectiles.push({
              body,
              weaponName: userData.weaponName,
            });
            break;
        }
      }

      return true;
    });

    return [players, projectiles];
  }
}
