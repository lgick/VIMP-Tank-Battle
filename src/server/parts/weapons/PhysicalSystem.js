import { Vec2, BoxShape, Circle } from 'planck';

export default class PhysicalSystem {
  constructor(world) {
    this._world = world;

    // пул свободных физических тел для снарядов
    this._pool = [];

    // предаллоцированные векторы
    this._zero = new Vec2(0, 0);
    this._position = new Vec2(0, 0);
    this._impulse = new Vec2(0, 0);
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

    // сброс состояния
    body.setLinearVelocity(this._zero);
    body.setAngularVelocity(0);

    const fixtureConfig = config.fixture || {};
    const damping = config.damping || {};
    let shape;
    let offset;
    const cos = Math.cos(shotData.angle);
    const sin = Math.sin(shotData.angle);

    switch (fixtureConfig.shape) {
      case 'box':
        shape = new BoxShape(config.size / 2, config.size / 2);
        offset = shotData.tankWidth / 2 + config.size / 2;
        break;
      case 'circle':
      default:
        // круг используется по умолчанию
        shape = new Circle(config.size);
        offset = shotData.tankWidth / 2 + config.size;
        break;
    }

    // вычисление точки спавна
    // (чтобы пуля не появилась внутри стреляющего танка)
    // смещаем на половину ширины танка + радиус тела
    const spawnX = shotData.position.x + cos * offset;
    const spawnY = shotData.position.y + sin * offset;

    this._position.set(spawnX, spawnY);
    body.setPosition(this._position);
    body.setAngle(shotData.angle);

    body.setLinearDamping(damping.linear ?? 0);
    body.setAngularDamping(damping.angular ?? 0);

    // создание новой формы пули
    body.createFixture(shape, {
      density: fixtureConfig.density ?? 1,
      friction: fixtureConfig.friction ?? 0.2,
      restitution: fixtureConfig.restitution ?? 0.1,
    });

    // привязка метаданных для обработки коллизий в Game.js
    // (_processContactEvents)
    body.setUserData({
      type: 'shot',
      gameId,
      weaponName,
    });

    if (config.impulseMagnitude) {
      // предаллоцированный вектор для применения силы
      this._impulse.set(
        cos * config.impulseMagnitude,
        sin * config.impulseMagnitude,
      );

      body.applyLinearImpulse(this._impulse, body.getWorldCenter(), true);
    }

    return body;
  }

  // убирает снаряд из физического мира и возвращает в пул
  despawn(body) {
    // деактивация (исключение тела из расчетов физики)
    body.setActive(false);

    // возвращение в пул для переиспользования
    this._pool.push(body);
  }
}
