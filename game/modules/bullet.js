// Singleton Bullet
var bullet;

function Bullet(models) {
  var p
    , time;

  if (bullet) {
    return bullet;
  }

  bullet = this;

  this._models = models;

  this._data = {}; // созданные пули в момент времени (время: массив пуль)
  this._currentBulletID = 0; // id для пуль
  this._time = this._minTime = this._maxTime = 1; // время жизни пули

  // вычисление максимального времени жизни пули
  for (p in this._models) {
    if (this._models.hasOwnProperty(p)) {
      time = this._models[p].time * 2;

      if (time > this._maxTime) {
        this._maxTime = time;
      }
    }
  }

  time = this._maxTime;

  // создание пустых данных
  while (time >= this._minTime) {
    this._data[time] = [];
    time -= 1;
  }
}

// сброс ID пуль
Bullet.prototype.resetBulletID = function () {
  this._currentBulletID = 0;
};

// обновляет время и возвращает массив старых пуль
Bullet.prototype.nextTime = function () {
  var arr = this._data[this._time];

  this._data[this._time] = [];

  this._time += 1;

  if (this._time > this._maxTime) {
    this._time = this._minTime;
  }

  return arr;
};

// добавляет новую пулю и возвращает ее ID
Bullet.prototype.addBullet = function (model) {
  var time = this._time + this._models[model].time
    , id;

  this._currentBulletID += 1;
  id = this._currentBulletID.toString(36);

  if (time > this._maxTime) {
    time = time - this._maxTime;
  }

  this._data[time].push([model, id]);

  return id;
};

module.exports = Bullet;
