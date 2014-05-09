var timeUpdate = 1000 / 30;
var timeRound = 120000;
var teams = ['team1', 'team2', 'spectators'];

function User(data) {
  this.game = [0, 0, 0, 0, ~~data.team, data.name];
  this.chat = null;
  this.panel = null;
  this.bullets = [];
  this.keys = null;
}

// преобразует данные из base36
User.prototype.parseKeys = function () {
  var cmd = parseInt(this.keys, 36).toString(2);
};

// обновляет данные
User.prototype.update = function () {
  //console.log(this.game[5] + ' is UPDATE DATA');
};

// создает пулю
User.prototype.createBullet = function () {
};

module.exports = User;
