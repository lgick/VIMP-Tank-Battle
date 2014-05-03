var timeUpdate = 1000 / 30;
var timeRound = 120000;
var teams = ['team1', 'team2', 'spectators'];
var maxPlayers = 8;
var respawn = [
  [
    [100, 128, 0],
    [100, 256, 0],
    [100, 384, 0],
    [100, 512, 0],
    [200, 128, 0],
    [200, 256, 0],
    [200, 384, 0],
    [200, 512, 0]
  ],
  [
    [700, 128, 180],
    [700, 256, 180],
    [700, 384, 180],
    [700, 512, 180]
    [600, 128, 180],
    [600, 256, 180],
    [600, 384, 180],
    [600, 512, 180]
  ]
];

function User(data) {
  this.x = data.x;
  this.y = 0;
  this.rotation = 0;
  this.gunRotation = 0;
  this.team = teams[data.team];
  this.name = data.name;

  this.chat = null;
  this.panel = null;

  this.bullets = [];
  this.keys = null;
}

User.prototype.parseKeys = function () {
  var cmd = parseInt(data, 36).toString(2);
};

module.exports = User;
