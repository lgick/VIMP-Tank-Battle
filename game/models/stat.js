// Singleton Stat
var stat;

function Stat(users, teams) {
  var p;

  if (stat) {
    return stat;
  }

  stat = this;

  this._users = users;

  this._head = {};
  this._body = {};

  this._headStatus = {};
  this._lastBody = [];

  for (p in teams) {
    if (teams.hasOwnProperty(p)) {
      this._head[p] = [teams[p], [0, '', 0, '']];
      this._body[p] = {};
    }
  }
}

// инициализация статистики
Stat.prototype.init = function () {
  var team
    , user
    , body;

  for (team in this._head) {
    if (this._head.hasOwnProperty(team)) {
      this._head[team][1][2] = 0;
      this._headStatus[team] = true;

      for (user in this._body[team]) {
        if (this._body[team].hasOwnProperty(user)) {
          body = this._body[team][user];

          body[2][1] = '';
          body[2][2] = 0;
          body[2][3] = 0;

          this._lastBody.push(body);
        }
      }
    }
  }
};

// добавляет пользователя
Stat.prototype.addUser = function (gameID) {
  var user = this._users[gameID]
    , team = user.team
    , head = this._head[team][1]
    , body;

  head[0] += 1;

  body = this._body[team][gameID] = [
    gameID, user.teamID, [user.name, '', 0, 0]
  ];

  this._headStatus[team] = true;
  this._lastBody.push(body);
};

// удаляет пользователя
Stat.prototype.removeUser = function (gameID) {
  var team
    , head
    , body;

  for (team in this._body) {
    if (this._body.hasOwnProperty(team)) {
      head = this._head[team][1];
      body = this._body[team][gameID];

      if (body) {
        head[0] -= 1;
        body[2] = null;

        this._headStatus[team] = true;
        this._lastBody.push(body);

        delete this._body[team][gameID];

        return;
      }
    }
  }
};

// меняет имя пользователя
Stat.prototype.renameUser = function (gameID) {
  var user = this._users[gameID]
    , body = this._body[user.team][gameID];

  body[2][0] = user.name;

  this._lastBody.push(body);
};

// добавляет score
Stat.prototype.addScore = function (gameID) {
  var user = this._users[gameID]
    , body = this._body[user.team][gameID];

  body[2][2] += 1;

  this._lastBody.push(body);
};

// добавляет score в head
Stat.prototype.addScoreHead = function (team) {
  this._head[team][1][2] += 1;
  this._headStatus[team] = true;
};

// добавляет death
Stat.prototype.addDeath = function (gameID) {
  var user = this._users[gameID]
    , body = this._body[user.team][gameID];

  body[2][3] += 1;

  this._lastBody.push(body);
};

// меняет статус пользователя
Stat.prototype.toggleStatusUser = function (gameID, dead) {
  var user = this._users[gameID]
    , body = this._body[user.team][gameID];

  if (dead) {
    body[2][1] = 'dead';
  } else {
    body[2][1] = '';
  }

  this._lastBody.push(body);
};

// возвращает последние изменения
Stat.prototype.getLastStat = function () {
  var stat = []
    , i = 0
    , len = this._lastBody.length
    , team;

  stat[0] = [];
  stat[1] = [];

  for (team in this._headStatus) {
    if (this._headStatus.hasOwnProperty(team)) {
      if (this._headStatus[team] === true) {
        stat[1].push(this._head[team]);
        this._headStatus[team] = false;
      }
    }
  }

  for (; i < len; i += 1) {
    stat[0].push(this._lastBody[i]);
  }

  this._lastBody = [];

  if (!stat[0].length && !stat[1].length) {
    stat = 0;
  }

  return stat;
};

// возвращает полную статистику
Stat.prototype.getStat = function () {
  var stat = []
    , team
    , user
    , body;

  stat[0] = [];
  stat[1] = [];

  for (team in this._head) {
    if (this._head.hasOwnProperty(team)) {
      stat[1].push(this._head[team]);

      for (user in this._body[team]) {
        if (this._body[team].hasOwnProperty(user)) {
          stat[0].push(this._body[team][user]);
        }
      }
    }
  }

  if (!stat[0].length && !stat[1].length) {
    stat = 0;
  }

  return stat;
};

module.exports = Stat;
