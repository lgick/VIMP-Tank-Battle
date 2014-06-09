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
  this.team = data.team;
  this.panel = [100, 200, 0];
  this._stat = [data.name, '', 0, 0];
  this._keys = null;
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
  if (this._keys === null) {
    return;
  }

  var keys = this._keys.split('');
  var rad = +(this.data[2] * (Math.PI / 180)).toFixed(10);

  var vX = Math.cos(rad) * 16;
  var vY = Math.sin(rad) * 16;

  console.log(keys);
  // forward
  if (keys[0] === '1') {
    this.data[0] = Math.round(vX) + this.data[0];
    this.data[1] = Math.round(vY) + this.data[1];
    console.log(this.data);
  }

  // back
  if (keys[1] === '1') {
    this.data[0] = Math.round(vX) - this.data[0];
    this.data[1] = Math.round(vY) - this.data[1];
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
  }

  // gLeft
  if (keys[5] === '1') {
    this.data[3] = this.data[3] - 4;
  }

  // gRight
  if (keys[6] === '1') {
    this.data[3] = this.data[3] + 4;
  }

  // fire
  if (keys[7] === '1') {
  }

// TODO: для spectators
 // // next player
 // if (keys[8] === '1') {
 // }

 // // prev player
 // if (keys[9] === '1') {
 // }


  //bot[0] = rangeNumber(nX, true, xMax, 0);
  //bot[1] = rangeNumber(nY, true, yMax, 0);

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
