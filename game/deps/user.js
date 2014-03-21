function User(data) {
  this.name = data.name;
  this.team = data.team;
  this.layer = data.layer;

  this.x = data.x;
  this.y = data.y;
  this.rotation = data.rotation;
  this.gunRotation = data.gunRotation;
}

module.exports = User;
