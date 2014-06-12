// проверяет число в заданном диапазоне
// Если repeat === true, то диапазон зациклен
// Если repeat === false, то диапазон ограничен значениями
// Возвращает значение
function rangeNumber(value, repeat, max, min) {
  repeat = repeat || false;
  max = max || 360;
  min = min || 0;

  // зациклить
  if (repeat === true) {
    if (value <= min) {
      value = max + value;
    }
    if (value >= max) {
      value = value - max;
    }
  // не зацикливать
  } else {
    if (value <= min) {
      value = min;
    }
    if (value >= max) {
      value = max;
    }
  }

  return value;
}

function User(data) {
  this.data = [0, 0, 0, 0, data.team, data.name];
  this.bullet = null;
  this.team = data.team;
  this.panel = [100, 200, 0];
  this._stat = [data.name, '', 0, 0];
  this._keys = null;

  this._acceleration = 0;
  this._maxForward = 25;
  this._maxBack = 15;

  this._maxGunAngle = 80;
  this._gunAngleStep = this._maxGunAngle / 10;
}

// преобразует данные из base36
User.prototype.parseKeys = function () {
  var cmd = parseInt(this.keys, 36).toString(2);
};

// назначает данные
User.prototype.setData = function (data) {
  this.data[0] = data[0];
  this.data[1] = data[1];
  this.data[2] = data[2];
};

// обновляет данные
User.prototype.updateData = function () {
  var rad = +(this.data[2] * (Math.PI / 180)).toFixed(10);
  var vX = Math.cos(rad) * this._acceleration;
  var vY = Math.sin(rad) * this._acceleration;

  if (this._keys === null) {
    if (this._acceleration > 0) {
      this._acceleration -= 1;
    } else if (this._acceleration < 0) {
      this._acceleration += 1;
    }

  } else {
    var keys = this._keys.split('');

    // forward
    if (keys[0] === '1') {
      if (this._acceleration < this._maxForward) {
        this._acceleration += 1;
      }
    } else

    // back
    if (keys[1] === '1') {
      if (this._acceleration > -this._maxBack) {
        this._acceleration -= 1;
      }
    } else {
      if (this._acceleration > 0) {
        this._acceleration -= 1;
      } else if (this._acceleration < 0) {
        this._acceleration += 1;
      }
    }

    // left
    if (keys[2] === '1') {
      this.data[2] = this.data[2] - 4;
    }

    // right
    if (keys[3] === '1') {
      this.data[2] = this.data[2] + 4;
    }

    // gCenter
    if (keys[4] === '1') {
      this.data[3] = 0;
    }

    // gLeft
    if (keys[5] === '1') {
      if (this.data[3] > -this._maxGunAngle) {
        this.data[3] = this.data[3] - this._gunAngleStep;
      }
    }

    // gRight
    if (keys[6] === '1') {
      if (this.data[3] < this._maxGunAngle) {
        this.data[3] = this.data[3] + this._gunAngleStep;
      }
    }

    // fire
    if (keys[7] === '1') {
      this.bullet = [this.data[0], this.data[1]];
    }

    //TODO: для spectators
    // // next player
    // if (keys[8] === '1') {
    // }
    //
    // // prev player
    // if (keys[9] === '1') {
    // }
  }

  this.data[0] = Math.round(vX) + this.data[0];
  this.data[1] = Math.round(vY) + this.data[1];

  this._keys = null;
};

// обновляет клавиши
User.prototype.updateKeys = function (keys) {
  this._keys = keys;
};

// возвращает статистику
User.prototype.getStat = function () {
  return this._stat;
};

// создает пулю
User.prototype.createBullet = function () {
};

module.exports = User;
