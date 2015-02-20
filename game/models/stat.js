// Singleton Stat
var stat;

function Stat(config, teams) {
  var p;

  if (stat) {
    return stat;
  }

  stat = this;

  this._config = config;

  this._head = {};
  this._body = {};

  this._lastHead = [];
  this._lastBody = [];

  for (p in teams) {
    if (teams.hasOwnProperty(p)) {
      this._head[teams[p]] = [teams[p], []];
      this._body[teams[p]] = {};
    }
  }
}

// сбрасывает статистику
Stat.prototype.reset = function () {
  var stat
    , teamID
    , bodyStats
    , gameID
    , p
    , conf;

  for (teamID in this._body) {
    if (this._body.hasOwnProperty(teamID)) {
      bodyStats = this._body[teamID];

      for (gameID in bodyStats) {
        if (bodyStats.hasOwnProperty(gameID)) {
          stat = bodyStats[gameID];
          stat[2] = this.getDefaultBody(stat[2]);
          this._lastBody.push(stat);
        }
      }
    }
  }

  for (teamID in this._head) {
    if (this._head.hasOwnProperty(teamID)) {
      stat = this._head[teamID];

      for (p in this._config) {
        if (this._config.hasOwnProperty(p)) {
          conf = this._config[p];

          if (conf.headSync) {
            this.updateHeadSync(teamID, p);
          } else if (typeof conf.headValue !== 'undefined') {
            stat[1][conf.key] = conf.headValue;
          }
        }
      }

      this._lastHead.push(stat);
    }
  }
};

// возвращает дефолтные данные для body
Stat.prototype.getDefaultBody = function (stat) {
  var p
    , conf;

  stat = stat || [];

  for (p in this._config) {
    if (this._config.hasOwnProperty(p)) {
      conf = this._config[p];

      if (typeof conf.bodyValue !== 'undefined') {
        stat[conf.key] = conf.bodyValue;
      }
    }
  }

  return stat;
};

// добавляет пользователя
Stat.prototype.addUser = function (gameID, teamID, data) {
  this._body[teamID][gameID] = [gameID, teamID, this.getDefaultBody()];

  if (typeof data === 'object') {
    this.updateUser(gameID, teamID, data);
  }
};

// удаляет пользователя и возвращает его данные
Stat.prototype.removeUser = function (gameID, teamID) {
  var data = this._body[teamID][gameID]
    , stat = {}
    , p
    , conf
    , value;

  delete this._body[teamID][gameID];
  this._lastBody.push([data[0], data[1], null]);

  data = data[2];

  // преобразование данных пользователя из массива в объект и
  // обновление head
  for (p in this._config) {
    if (this._config.hasOwnProperty(p)) {
      conf = this._config[p];
      value = data[conf.key];

      stat[p] = value;

      if (conf.headSync === true) {
        this.updateHeadSync(teamID, p, true);
      }
    }
  }

  return stat;
};

// перемещает пользователя в новую команду
Stat.prototype.moveUser = function (gameID, teamID, newTeamID) {
  this.addUser(gameID, newTeamID, this.removeUser(gameID, teamID));
};

// обновляет статистику пользователя
Stat.prototype.updateUser = function (gameID, teamID, data) {
  var stat = this._body[teamID][gameID]
    , p
    , conf
    , method
    , value;

  for (p in data) {
    if (data.hasOwnProperty(p)) {
      conf = this._config[p];
      method = conf.bodyMethod;
      value = data[p];

      // если метод 'замена'
      if (method === 'replace') {
        stat[2][conf.key] = value;

      // иначе если метод 'добавление'
      } else if (method === 'add') {
        stat[2][conf.key] += value;
      }

      if (conf.headSync === true) {
        this.updateHeadSync(teamID, p, true);
      }
    }
  }

  this._lastBody.push(stat);
};

// обновляет статистику head
Stat.prototype.updateHead = function (teamID, param, value) {
  var stat = this._head[teamID]
    , conf = this._config[param]
    , method = conf.headMethod
    , key = conf.key;

  // если метод 'добавление'
  if (method === 'add') {
    stat[1][key] += value;

  // если метод 'замена'
  } else if (method === 'replace') {
    stat[1][key] = value;
  }

  this._lastHead.push(stat);
};

// обновляет статистику head синхронизированную с body
Stat.prototype.updateHeadSync = function (teamID, param, save) {
  var stat = this._head[teamID]
    , bodyStats = this._body[teamID]
    , conf = this._config[param]
    , method = conf.headMethod
    , key = conf.key
    , p
    , value;

  // если метод 'количество'
  if (method === 'quantity') {
    value = Object.keys(bodyStats).length;

  // иначе если метод 'добавление'
  } else if (method === 'add') {
    value = 0;

    for (p in bodyStats) {
      if (bodyStats.hasOwnProperty(p)) {
        value += bodyStats[p][2][key];
      }
    }
  }

  stat[1][key] = value;

  if (save === true) {
    this._lastHead.push(stat);
  }
};

// возвращает последние изменения
Stat.prototype.getLast = function () {
  var stat = [this._lastBody, this._lastHead];

  this._lastBody = [];
  this._lastHead = [];

  if (!stat[0].length && !stat[1].length) {
    stat = 0;
  }

  return stat;
};

// возвращает полную статистику
Stat.prototype.getFull = function () {
  var stat = []
    , teamID
    , bodyStats
    , gameID;

  stat[0] = [];
  stat[1] = [];

  for (teamID in this._body) {
    if (this._body.hasOwnProperty(teamID)) {
      bodyStats = this._body[teamID];

      for (gameID in bodyStats) {
        if (bodyStats.hasOwnProperty(gameID)) {
          stat[0].push(bodyStats[gameID]);
        }
      }
    }
  }

  for (teamID in this._head) {
    if (this._head.hasOwnProperty(teamID)) {
      stat[1].push(this._head[teamID]);
    }
  }

  if (!stat[0].length && !stat[1].length) {
    stat = 0;
  }

  return stat;
};

module.exports = Stat;
