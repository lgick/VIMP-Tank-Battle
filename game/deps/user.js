function User(data) {
  this.name = data.name;
  this.team = data.team;
  this.layer = data.layer;

  this.x = data.x;
  this.y = data.y;
  this.rotation = data.rotation;
  this.gunRotation = data.gunRotation;
}

User.prototype.update = function (data) {
  var cmd = parseInt(data, 36).toString(2);
}

module.exports = User;
