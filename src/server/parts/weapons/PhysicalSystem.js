import { Vec2, BoxShape, Circle } from 'planck';

const ZERO = new Vec2(0, 0);

export default class PhysicalSystem {
  constructor(world) {
    this._world = world;

    // пул свободных физических тел для снарядов
    this._pool = [];
  }

  // создает или достает из пула физическое тело снаряда
  spawn(shotData, config, gameId, weaponName) {
    let body;

    // если тело из пула
    if (this._pool.length > 0) {
      body = this._pool.pop();

      // очистка старых фикстур (если тело взято из пула)
      // это безопасно позволяет переиспользовать одно тело
      // для оружия разных размеров
      let f = body.getFixtureList();

      while (f) {
        const next = f.getNext();

        body.destroyFixture(f);
        f = next;
      }

      // активация тела в физическом мире
      body.setActive(true);
      body.setAwake(true);

      // иначе создаём новое тело
    } else {
      // bullet: true включает CCD (continuous collision detection),
      // чтобы быстрое тело не пролетало сквозь тонкие стены
      body = this._world.createBody({
        type: 'dynamic',
        bullet: true,
      });
    }

    // вычисление точки спавна
    // (чтобы пуля не появилась внутри стреляющего танка)
    // смещаем на половину ширины танка + радиус тела
    const offset = shotData.tankWidth / 2 + config.size;
    const spawnX = shotData.position.x + Math.cos(shotData.angle) * offset;
    const spawnY = shotData.position.y + Math.sin(shotData.angle) * offset;

    body.setPosition(new Vec2(spawnX, spawnY));
    body.setAngle(shotData.angle);

    // настройка сопротивления среды
    const damping = config.damping || {};

    body.setLinearDamping(damping.linear || 0);
    body.setAngularDamping(damping.angular || 0);

    const fixture = config.fixture;
    let shape;

    switch (fixture.shape) {
      case 'box':
        shape = new BoxShape(config.size / 2, config.size / 2);
        break;
      case 'circle':
      default:
        // круг используется по умолчанию
        shape = new Circle(config.size);
        break;
    }

    // создание новой формы пули
    body.createFixture(shape, {
      density: fixture.density || 1,
      friction: fixture.friction || 0.2,
      restitution: fixture.restitution || 0.1,
    });

    // привязка метаданных для обработки коллизий в Game.js
    // (_processContactEvents)
    body.setUserData({
      type: 'shot',
      gameId,
      weaponName,
    });

    if (config.impulseMagnitude) {
      // применение импульса (выстрел)
      // вектор направления умножается на силу из конфига
      const dir = new Vec2(Math.cos(shotData.angle), Math.sin(shotData.angle));
      const impulse = dir.mul(config.impulseMagnitude);

      body.applyLinearImpulse(impulse, body.getWorldCenter(), true);
    }

    return body;
  }

  // убирает снаряд из физического мира и возвращает в пул
  despawn(body) {
    // деактивация (исключение тела из расчетов физики)
    body.setActive(false);

    // сброс скоростей от предыдущих полетов
    body.setLinearVelocity(ZERO);
    body.setAngularVelocity(0);

    // возвращение в пул для переиспользования
    this._pool.push(body);
  }
}
