import planck from 'planck';

class Tank {
  constructor(data) {
    const modelData = data.modelData;

    this._keys = data.keys;
    this._maxGunAngle = modelData.maxGunAngle;
    this._gunAngleStep = modelData.gunAngleStep;

    this._bulletData = null;

    this._magnitude = 20;
    this._currentForward = 0;
    this._currentBack = 0;
    this._maxForward = data.maxForward;
    this._maxBack = data.maxBack;

    this.initBody(data.modelData);
  }

  // инициализация тела модели
  initBody(modelData) {
    this._body = new planck.Body({
      mass: modelData.mass,
      position: modelData.position,
      angle: modelData.angle,
      velocity: modelData.velocity || [0, 0],
      force: modelData.force || [0, 0],
      angularVelocity: modelData.angularVelocity || 0,
    });

    this._body.gunRotation = modelData.gunRotation || 0;
    this._body.addShape(
      new planck.Box({
        width: modelData.width,
        height: modelData.height,
      }),
    );
  }

  // обновляет данные
  updateData(keys) {
    const angle = this._body.angle + Math.PI / 2;
    const rad = +(angle * (Math.PI / 180)).toFixed(10);
    const vX = Math.cos(rad);
    const vY = Math.sin(rad);
    let radBullet;

    if (keys & this._keys.forward) {
      if (this._magnitude < 40) {
        this._magnitude += 1;
      }
    } else {
      if (this._magnitude > 0) {
        this._magnitude -= 1;
      }
    }

    if (keys & this._keys.back) {
    }

    if (this._magnitude > 0) {
      vX = Math.round(vX * this._magnitude);
      vY = Math.round(vY * this._magnitude);

      this._body.position[0] += vX;
      this._body.position[1] += vY;
    }

    if (keys & this._keys.back) {
      this._body.velocity[0] -= vX;
      this._body.velocity[1] -= vY;
    }

    if (keys & this._keys.left) {
      this._body.angle -= 4;

      if (this._body.angle < 0) {
        this._body.angle = 356;
      }
    } else if (keys & this._keys.right) {
      this._body.angle += 4;

      if (this._body.angle > 360) {
        this._body.angle = 4;
      }
    }

    if (keys & this._keys.gCenter) {
      this._body.gunRotation = 0;
    }

    if (keys & this._keys.gLeft) {
      if (this._body.gunRotation > -this._maxGunAngle) {
        this._body.gunRotation = this._body.gunRotation - this._gunAngleStep;
      }
    }

    if (keys & this._keys.gRight) {
      if (this._body.gunRotation < this._maxGunAngle) {
        this._body.gunRotation = this._body.gunRotation + this._gunAngleStep;
      }
    }

    if (keys & this._keys.fire) {
      radBullet = +(
        (this._body.gunRotation + this._body.angle) *
        (Math.PI / 180)
      ).toFixed(2);
      this._bulletData = [
        Math.round(Math.cos(radBullet) * 2) + this._body.position[0],
        Math.round(Math.sin(radBullet) * 2) + this._body.position[1],
        Math.round(Math.cos(radBullet) * 2) + vX,
        Math.round(Math.sin(radBullet) * 2) + vY,
        this._body.angle + this._body.gunRotation,
      ];
    }
  }

  // возвращает тело модели
  getBody() {
    return this._body;
  }

  // возвращает данные
  getData() {
    const body = this._body;

    return [].concat(
      ~~body.position[0].toFixed(2),
      ~~body.position[1].toFixed(2),
      ~~body.angle.toFixed(2),
      body.gunRotation,
    );
  }

  // возвращает полные данные
  getFullData(dataArr) {
    const body = this._body;

    return [].concat(
      body.position[0],
      body.position[1],
      body.angle,
      body.gunRotation,
      dataArr,
    );
  }

  // возвращает данные для создания пули
  getBulletData() {
    const bulletData = this._bulletData;

    this._bulletData = null;

    return bulletData;
  }
}

export default Tank;
