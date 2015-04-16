function User(data) {
  this._layer = 2;

  this._acceleration = 0;
  this._maxForward = 20;
  this._maxBack = 10;
  this._step = 0.5;

  // TODO перенести в конструктор
  this._keyForward = 1;
  this._keyBack = 2;
  this._keyLeft = 4;
  this._keyRight = 8;
  this._keyGCenter = 16;
  this._keyGLeft = 32;
  this._keyGRight = 64;
  this._keyFire = 128;
  this._keyNextPlayer = 256;
  this._keyPrevPlayer = 512;

  this._maxGunAngle = 90;
  this._gunAngleStep = this._maxGunAngle / 3;

  this._teamID = data.teamID;
  this._name = data.name;
  this._model = data.model;

  this._data = [];
  this._userUpdate = false;
  this._bullet = null;
}

// назначает данные
User.prototype.setData = function (data) {
  this._data[0] = data[0];
  this._data[1] = data[1];
  this._data[2] = data[2];
  this._data[3] = 0;
  //this._data[4] = this._teamID;
  //this._data[5] = this._name;
};

// возвращает данные
User.prototype.getData = function () {
  if (this._userUpdate === true) {
    this._userUpdate = false;
    this.getFullData();
  } else {
     return this._data;
  }
};

// возвращает полные данные
User.prototype.getFullData = function () {
  return this._data.concat([this._teamID, this._name]);
};

// возвращает координаты игрока
User.prototype.getCoords = function () {
  return [this._data[0], this._data[1]];
};

// возвращает пулю
User.prototype.getBullet = function () {
  var bullet = this._bullet;

  this._bullet = null;

  return bullet;
};

// обновляет teamID
User.prototype.updateTeamID = function (teamID) {
  this._teamID = teamID;
  this._userUpdate = true;
};

// обновляет имя
User.prototype.updateName = function (name) {
  this._name = name;
  this._userUpdate = true;
};

// обновляет данные
User.prototype.updateData = function () {
  var rad = +(this._data[2] * (Math.PI / 180)).toFixed(10);
  var vX = Math.round(Math.cos(rad) * this._acceleration);
  var vY = Math.round(Math.sin(rad) * this._acceleration);
  var radBullet;

  if (this.keys === null) {
    if (this._acceleration > 0) {
      this._acceleration -= this._step;
    } else if (this._acceleration < 0) {
      this._acceleration += this._step;
    }

  } else {

    // forward
    if (this.keys & this._keyForward) {
      if (this._acceleration < this._maxForward) {
        this._acceleration += this._step * 4;
      }
    } else

    // back
    if (this.keys & this._keyBack) {
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
    if (this.keys & this._keyLeft) {
      this._data[2] = this._data[2] - 4;
      if (this._data[2] < 0) {
        this._data[2] = 356;
      }
    }

    // right
    if (this.keys & this._keyRight) {
      this._data[2] = this._data[2] + 4;
      if (this._data[2] > 360) {
        this._data[2] = 4;
      }
    }

    // gCenter
    if (this.keys & this._keyGCenter) {
      this._data[3] = 0;
    }

    // gLeft
    if (this.keys & this._keyGLeft) {
      if (this._data[3] > -this._maxGunAngle) {
        this._data[3] = this._data[3] - this._gunAngleStep;
      }
    }

    // gRight
    if (this.keys & this._keyGRight) {
      if (this._data[3] < this._maxGunAngle) {
        this._data[3] = this._data[3] + this._gunAngleStep;
      }
    }

    // fire
    if (this.keys & this._keyFire) {
      radBullet = +((this._data[3] + this._data[2]) * (Math.PI / 180)).toFixed(2);

      this._bullet = [
        Math.round(Math.cos(radBullet) * 20) + this._data[0],
        Math.round(Math.sin(radBullet) * 20) + this._data[1],
        Math.round(Math.cos(radBullet) * 20) + vX,
        Math.round(Math.sin(radBullet) * 20) + vY,
        this._layer
      ];
    }

  }

  this._data[0] = vX + this._data[0];
  this._data[1] = vY + this._data[1];

  this.keys = null;
};

module.exports = User;
