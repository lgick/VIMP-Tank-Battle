import { BoxShape, Vec2 } from 'planck';

class Tank {
  constructor(data) {
    this._modelData = data.modelData;
    this._keys = data.keys;

    this._maxGunAngle = this._modelData.maxGunAngle;
    this._gunAngleStep = this._modelData.gunAngleStep;

    this._bulletData = null;

    // Тело создадим позже через initBody(world)
    this._body = null;
  }

  // Инициализация тела модели в переданном мире
  initBody(world) {
    const modelData = this._modelData;

    this._body = world.createBody({
      type: 'dynamic',
      position: new Vec2(modelData.position[0], modelData.position[1]),
      angle: modelData.angle * (Math.PI / 180),
      angularDamping: 1,
      linearDamping: 0.8,
      allowSleep: false,
    });

    // Добавляем пользовательское свойство для поворота пушки
    this._body.gunRotation = modelData.gunRotation || 0;

    // Добавляем форму. Для прямоугольника используем planck.Box,
    // передавая половину ширины и высоты.
    this._body.createFixture(
      new BoxShape(modelData.width / 2, modelData.height / 2),
      this._modelData.density,
    );
  }

  // Обновление данных (управление движением, поворотом и стрельбой)
  updateData(keys) {
    const angleRad = this._body.getAngle();

    if (keys & this._keys.forward) {
      let f = this._body.getWorldVector(new Vec2(200.0, 0.0));
      let p = this._body.getWorldPoint(new Vec2(-400.0, 0.0));
      this._body.applyLinearImpulse(f, p, true);
    }

    if (keys & this._keys.back) {
      let f = this._body.getWorldVector(new Vec2(-100.0, 0.0));
      let p = this._body.getWorldPoint(new Vec2(200.0, 0.0));
      this._body.applyLinearImpulse(f, p, true);
    }

    // Поворот танка – можно оставить как есть, но, возможно, стоит уменьшить величину импульса
    if (keys & this._keys.left) {
      this._body.setAngle(angleRad - 0.03);
    }
    if (keys & this._keys.right) {
      this._body.setAngle(angleRad + 0.03);
    }

    // Управление пушкой остаётся без изменений
    if (keys & this._keys.gCenter) {
      this._body.gunRotation = 0;
    }
    if (keys & this._keys.gLeft) {
      if (this._body.gunRotation > -this._maxGunAngle) {
        this._body.gunRotation -= this._gunAngleStep;
      }
    }
    if (keys & this._keys.gRight) {
      if (this._body.gunRotation < this._maxGunAngle) {
        this._body.gunRotation += this._gunAngleStep;
      }
    }

    // Обработка стрельбы (если требуется)
    if (keys & this._keys.fire) {
      // Здесь исправьте, если требуется, расчёт угла для пули
      const bodyAngleDeg = this._body.getAngle() * (180 / Math.PI);
      const radBullet =
        (bodyAngleDeg + this._body.gunRotation) * (Math.PI / 180);
      const pos = this._body.getWorldCenter();
      const bulletVel = new Vec2(Math.cos(radBullet), Math.sin(radBullet)).mul(
        2,
      );
      this._bulletData = {
        position: pos.add(bulletVel),
        velocity: bulletVel,
        angle: bodyAngleDeg + this._body.gunRotation,
      };
    }
  }
  // Возвращает тело модели
  getBody() {
    return this._body;
  }

  // Возвращает основные данные танка
  getData() {
    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle();

    return [pos.x, pos.y, angleDeg, this._body.gunRotation];
  }

  // Возвращает полные данные (например, для синхронизации с клиентом)
  getFullData(teamId, userName) {
    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle();

    return [
      pos.x,
      pos.y,
      angleDeg,
      this._body.gunRotation,
      teamId,
      userName,
      this._modelData.width,
      this._modelData.height,
    ];
  }

  // Возвращает данные для создания пули и сбрасывает их
  getBulletData() {
    const bulletData = this._bulletData;
    this._bulletData = null;
    return bulletData;
  }
}

export default Tank;
