var p2 = require('p2');

function Bullet(data) {
}

// создает данные
Bullet.prototype.create = function (data) {
  var time = this._bulletTime + this._bullets[bulletName].time
    , bulletBody
    , bulletShape
    , bulletID;

  bulletBody = new p2.Body({
    mass: 0.05,
    position: bulletData.position,
    velocity: bulletData.velocity,
    angle: bulletData.angle
  });

  bulletBody.damping = bulletBody.angularDamping = 0;

  bulletShape = new p2.Circle(3);
  bulletShape.collisionGroup = Math.pow(2, 2);
  bulletShape.collisionMask = Math.pow(2, 3);

  bulletBody.addShape(bulletShape);

  this._currentBulletID += 1;
  bulletID = this._currentBulletID.toString(36);

  if (time > this._maxBulletTime) {
    time = time - this._maxBulletTime;
  }

  this._world.addBody(bulletBody);
  this._bulletData[time].push([bulletName, bulletID, bulletBody, gameID]);

  return bulletID;
};

// обновляет данные
Bullet.prototype.update = function (data, cb) {
}

module.exports = Bullet;
