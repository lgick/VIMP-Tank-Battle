var p2 = require('p2');

function Bullet(data) {
  var bulletSet = data.bulletSet
    , bulletData = data.bulletData;

  this._body = new p2.Body({
    mass: bulletSet.mass || 20,
    position: [bulletData[0], bulletData[1]],
    angle: bulletData[4],
    velocity: [0, 0],
    force: [0, 0],
    angularVelocity: 0
  });

  this._body.addShape(new p2.Circle({
    width: bulletSet.width,
    height: bulletSet.height
  }));
}

// возвращает тело модели
Bullet.prototype.getBody = function () {
  return this._body;
};

// обновляет данные
Bullet.prototype.update = function (data, cb) {
};

module.exports = Bullet;
