import planck from 'planck';

class Tank {
  constructor(data) {
    this._modelData = data.modelData;
    this._keys = data.keys;

    this._maxGunAngle = this._modelData.maxGunAngle;
    this._gunAngleStep = this._modelData.gunAngleStep;
    this._maxForward = this._modelData.maxForward;
    this._maxBack = this._modelData.maxBack;

    this._bulletData = null;
    this._magnitude = 20;
    this._currentForward = 0;
    this._currentBack = 0;

    // Тело создадим позже через initBody(world)
    this._body = null;
  }

  // Инициализация тела модели в переданном мире
  initBody(world) {
    const modelData = this._modelData;
    // Создаём тело через world.createBody. Задаём тип 'dynamic'
    this._body = world.createBody({
      type: 'dynamic',
      position: { x: modelData.position[0], y: modelData.position[1] },
      angle: modelData.angle, // предполагается, что угол в радианах
      linearVelocity: modelData.velocity
        ? { x: modelData.velocity[0], y: modelData.velocity[1] }
        : { x: 0, y: 0 },
      angularVelocity: modelData.angularVelocity || 0,
    });
    // Добавляем пользовательское свойство для поворота пушки
    this._body.gunRotation = modelData.gunRotation || 0;
    // Добавляем форму. Для прямоугольника используем planck.Box,
    // передавая половину ширины и высоты.
    this._body.createFixture({
      shape: new planck.BoxShape(modelData.width / 2, modelData.height / 2),
      density: this._modelData.mass || 20,
    });
  }

  // Обновление данных (управление движением, поворотом и стрельбой)
  updateData(keys) {
    if (!this._body) return;

    // Получаем текущий угол танка (переводим из радиан в градусы)
    let bodyAngleDeg = this._body.getAngle() * (180 / Math.PI);
    // Вычисляем угол для движения (сдвигаем на 90°)
    const moveAngleDeg = bodyAngleDeg + 90;
    const moveRad = moveAngleDeg * (Math.PI / 180);
    // Начальные значения направления движения
    let vX = Math.cos(moveRad);
    let vY = Math.sin(moveRad);

    // Увеличиваем или уменьшаем величину движения
    if (keys & this._keys.forward) {
      if (this._magnitude < 40) {
        this._magnitude += 1;
      }
    } else if (this._magnitude > 0) {
      this._magnitude -= 1;
    }

    // Если имеется ненулевая величина, перемещаем танк
    if (this._magnitude > 0) {
      // Рассчитываем смещение (округляем для целых значений)
      const moveX = Math.round(vX * this._magnitude);
      const moveY = Math.round(vY * this._magnitude);
      const pos = this._body.getPosition();
      this._body.setPosition({ x: pos.x + moveX, y: pos.y + moveY });
      // Обновляем значения vX и vY для дальнейших вычислений
      vX = moveX;
      vY = moveY;
    }

    // Если нажата клавиша назад – корректируем линейную скорость
    if (keys & this._keys.back) {
      const currentVel = this._body.getLinearVelocity();
      this._body.setLinearVelocity({
        x: currentVel.x - vX,
        y: currentVel.y - vY,
      });
    }

    // Поворот танка влево или вправо (изменяем угол)
    if (keys & this._keys.left) {
      let newAngleDeg = bodyAngleDeg - 4;
      if (newAngleDeg < 0) newAngleDeg = 356;
      this._body.setAngle(newAngleDeg * (Math.PI / 180));
    } else if (keys & this._keys.right) {
      let newAngleDeg = bodyAngleDeg + 4;
      if (newAngleDeg > 360) newAngleDeg = 4;
      this._body.setAngle(newAngleDeg * (Math.PI / 180));
    }

    // Управление поворотом пушки
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

    // Если нажата клавиша стрельбы – рассчитываем данные для создания пули
    if (keys & this._keys.fire) {
      // Получаем актуальный угол танка
      bodyAngleDeg = this._body.getAngle() * (180 / Math.PI);
      // Рассчитываем суммарный угол (танк + пушка) в радианах
      const radBullet =
        (this._body.gunRotation + bodyAngleDeg) * (Math.PI / 180);
      const pos = this._body.getPosition();
      this._bulletData = [
        Math.round(Math.cos(radBullet) * 2) + pos.x,
        Math.round(Math.sin(radBullet) * 2) + pos.y,
        Math.round(Math.cos(radBullet) * 2) + vX,
        Math.round(Math.sin(radBullet) * 2) + vY,
        bodyAngleDeg + this._body.gunRotation,
      ];
    }
  }

  // Возвращает тело модели
  getBody() {
    return this._body;
  }

  // Возвращает основные данные танка
  getData() {
    if (!this._body) return null;
    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle() * (180 / Math.PI);
    return [
      ~~pos.x.toFixed(2),
      ~~pos.y.toFixed(2),
      ~~angleDeg.toFixed(2),
      this._body.gunRotation,
    ];
  }

  // Возвращает полные данные (например, для синхронизации с клиентом)
  getFullData(dataArr) {
    if (!this._body) return null;
    const pos = this._body.getPosition();
    const angleDeg = this._body.getAngle() * (180 / Math.PI);
    return [pos.x, pos.y, angleDeg, this._body.gunRotation, dataArr];
  }

  // Возвращает данные для создания пули и сбрасывает их
  getBulletData() {
    const bulletData = this._bulletData;
    this._bulletData = null;
    return bulletData;
  }
}

export default Tank;
