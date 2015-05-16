function Tank(data) {
  var keys = data.keys
    , model = data.model
    , coords = data.coords;

  this._maxForward = model.maxForward || 20;
  this._maxBack = model.maxBack || 10;
  this._step = model.step || 0.5;
  this._maxGunAngle = model.maxGunAngle || 90;
  this._gunAngleStep = model.gunAngleStep || this._maxGunAngle / 3;

  this._currentBullet = model.currentBullet;
  this._bullets = model.bullets;
  this._bulletList = Object.keys(this._bullets);

  this._acceleration = 0;

  this._keyForward = keys.forward;
  this._keyBack = keys.back;
  this._keyLeft = keys.left;
  this._keyRight = keys.right;
  this._keyGCenter = keys.gCenter;
  this._keyGLeft = keys.gLeft;
  this._keyGRight = keys.gRight;
  this._keyFire = keys.fire;
  this._nextBullet = keys.nextBullet;
  this._prevBullet = keys.prevBullet;

  this._data = [];
  this._bullet = null;
  this._keys = null;

  if (coords) {
    this.setData(coords);
  }
}

// назначает данные
Tank.prototype.setData = function (data) {
  this._data = [data[0], data[1], data[2], 0];
};

// возвращает данные
Tank.prototype.getData = function () {
  return this._data;
};

// возвращает копию данных
Tank.prototype.getCopyData = function () {
  var data = {}
    , p;

  for (p in this._data) {
    if (this._data.hasOwnProperty(p)) {
      data[p] = this._data[p];
    }
  }

  return data;
};

// возвращает полные данные
Tank.prototype.getFullData = function (arr) {
  return this._data.concat(arr);
};

// возвращает координаты игрока
Tank.prototype.getCoords = function () {
  return [this._data[0], this._data[1]];
};

// возвращает данные о пуле
Tank.prototype.getBulletData = function () {
  var bullet = this._bullet;

  this._bullet = null;

  return bullet;
};

// возвращает тип пули
Tank.prototype.getBulletName = function () {
  return this._currentBullet;
};

// меняет пулю
Tank.prototype.setBulletName = function (bullet) {
  if (this._bullets[bullet]) {
    this._currentBullet = bullet;
  }
};

// меняет пулю
Tank.prototype.turnBullet = function (back) {
  var key = this._bulletList.indexOf(this._currentBullet);

  // если пулю назад
  if (back) {
    key -= 1;
  } else {
    key += 1;
  }

  if (key < 0) {
    key = this._bulletList.length - 1;
  } else if (key >= this._bulletList.length) {
    key = 0;
  }

  this._currentBullet = this._bulletList[key];
};

// обновляет клавиши
Tank.prototype.updateKeys = function (keys) {
  this._keys = keys;
};

// обновляет данные
Tank.prototype.updateData = function () {
  // TODO выставлять флаг обновления и отправлять данные
  // только в случае их изменения

  var rad = +(this._data[2] * (Math.PI / 180)).toFixed(10);
  var vX = Math.round(Math.cos(rad) * this._acceleration);
  var vY = Math.round(Math.sin(rad) * this._acceleration);
  var radBullet;

  if (this._keys === null) {
    if (this._acceleration > 0) {
      this._acceleration -= this._step;
    } else if (this._acceleration < 0) {
      this._acceleration += this._step;
    }

  } else {

    // forward
    if (this._keys & this._keyForward) {
      if (this._acceleration < this._maxForward) {
        this._acceleration += this._step * 4;
      }
    } else

    // back
    if (this._keys & this._keyBack) {
      if (this._acceleration > -this._maxBack) {
        this._acceleration -= this._step * 2;
      }
    } else {
      if (this._acceleration > 0) {
        this._acceleration -= this._step;
      } else if (this._acceleration < 0) {
        this._acceleration += this._step;
      }
    }

    // left
    if (this._keys & this._keyLeft) {
      this._data[2] = this._data[2] - 4;
      if (this._data[2] < 0) {
        this._data[2] = 356;
      }
    }

    // right
    if (this._keys & this._keyRight) {
      this._data[2] = this._data[2] + 4;
      if (this._data[2] > 360) {
        this._data[2] = 4;
      }
    }

    // gCenter
    if (this._keys & this._keyGCenter) {
      this._data[3] = 0;
    }

    // gLeft
    if (this._keys & this._keyGLeft) {
      if (this._data[3] > -this._maxGunAngle) {
        this._data[3] = this._data[3] - this._gunAngleStep;
      }
    }

    // gRight
    if (this._keys & this._keyGRight) {
      if (this._data[3] < this._maxGunAngle) {
        this._data[3] = this._data[3] + this._gunAngleStep;
      }
    }

    // fire
    if (this._keys & this._keyFire) {
      radBullet = +((this._data[3] + this._data[2]) * (Math.PI / 180)).toFixed(2);

      this._bullet = [
        Math.round(Math.cos(radBullet) * 20) + this._data[0],
        Math.round(Math.sin(radBullet) * 20) + this._data[1],
        Math.round(Math.cos(radBullet) * 20) + vX,
        Math.round(Math.sin(radBullet) * 20) + vY,
        this._data[2] + this._data[3]
      ];
    }

    // next bullet
    if (this._keys & this._nextBullet) {
      this.turnBullet();
    }

    // prev bullet
    if (this._keys & this._prevBullet) {
      this.turnBullet(true);
    }
  }

  this._data[0] = vX + this._data[0];
  this._data[1] = vY + this._data[1];

  this._keys = null;
};

module.exports = Tank;
