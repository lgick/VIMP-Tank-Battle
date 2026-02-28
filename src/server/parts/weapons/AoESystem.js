import { AABB, Vec2 } from 'planck';

export default class AoESystem {
  constructor(world) {
    this._world = world;

    // предаллокация всех векторов и AABB
    this._lower = new Vec2(0, 0);
    this._upper = new Vec2(0, 0);
    this._aabb = new AABB(this._lower, this._upper);

    // вектор для импульса
    this._impulse = new Vec2(0, 0);
  }

  // находит цели в радиусе взрыва, применяет физический импульс
  // и возвращает массив задетых танков для нанесения урона
  process(pos, config) {
    const { radius, impulseMagnitude } = config;

    // квадрат радиуса
    const radiusSq = radius * radius;

    // границы AABB
    this._aabb.lowerBound.set(pos.x - radius, pos.y - radius);
    this._aabb.upperBound.set(pos.x + radius, pos.y + radius);

    const players = [];
    const projectiles = [];

    // защита от двойного урона, если у цели несколько фикстур
    const processedBodies = new Set();

    // поиск всех фикстур внутри AABB
    this._world.queryAABB(this._aabb, fixture => {
      const body = fixture.getBody();

      // если цель статична (стены) или уже обработана ранее
      if (!body.isDynamic() || processedBodies.has(body)) {
        return true;
      }

      const userData = body.getUserData();

      // если нет userData
      if (!userData) {
        return true;
      }

      const targetPos = body.getPosition();

      // реальная дистанция (AABB - это квадрат, а взрыв - круг)
      const dx = targetPos.x - pos.x;
      const dy = targetPos.y - pos.y;
      const distSq = dx * dx + dy * dy;

      // если цель не находится в радиусе кругового взрыва
      if (distSq > radiusSq) {
        return true;
      }

      processedBodies.add(body);

      const distance = Math.sqrt(distSq);
      const falloff = 1 - distance / radius; // чем дальше, тем слабее

      // применение физического импульса (взрывная волна расталкивает цели)
      if (impulseMagnitude && distance > 0) {
        const actualImpulse = impulseMagnitude * falloff;
        const scale = actualImpulse / distance;

        // нормализация вектора направления от эпицентра к танку
        this._impulse.set(dx * scale, dy * scale);

        // толчок цели в центр его массы
        body.applyLinearImpulse(this._impulse, body.getWorldCenter(), true);
      }

      // сохранение данных для дальнейших действий
      switch (userData.type) {
        case 'player':
          players.push({
            id: userData.gameId,
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

      return true;
    });

    return [players, projectiles];
  }
}
