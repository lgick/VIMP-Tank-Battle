// Singleton Stat
let stat;

class Stat {
  constructor(config, teams) {
    if (stat) {
      return stat;
    }

    stat = this;

    this._config = config;

    this._head = {};
    this._body = {};

    this._lastHead = new Map();
    this._lastBody = new Map();

    for (const p in teams) {
      if (teams.hasOwnProperty(p)) {
        this._head[teams[p]] = [teams[p], []];
        this._body[teams[p]] = {};
      }
    }
  }

  // сбрасывает статистику
  reset() {
    for (const teamID in this._body) {
      if (this._body.hasOwnProperty(teamID)) {
        const bodyStats = this._body[teamID];

        for (const gameID in bodyStats) {
          if (bodyStats.hasOwnProperty(gameID)) {
            const stat = bodyStats[gameID];
            stat[2] = this.getDefaultBody(stat[2]);
            this._lastBody.set(`${stat[0]}|${stat[1]}`, stat.slice(2));
          }
        }
      }
    }

    for (const teamID in this._head) {
      if (this._head.hasOwnProperty(teamID)) {
        const stat = this._head[teamID];

        for (const p in this._config) {
          if (this._config.hasOwnProperty(p)) {
            const conf = this._config[p];

            if (conf.headSync) {
              this.updateHeadSync(teamID, p);
            } else if (typeof conf.headValue !== 'undefined') {
              stat[1][conf.key] = conf.headValue;
            }
          }
        }

        this._lastHead.set(stat[0], stat.slice(1));
      }
    }
  }

  // возвращает дефолтные данные для body
  getDefaultBody(stat = []) {
    for (const p in this._config) {
      if (this._config.hasOwnProperty(p)) {
        const conf = this._config[p];

        if (typeof conf.bodyValue !== 'undefined') {
          stat[conf.key] = conf.bodyValue;
        }
      }
    }

    return stat;
  }

  // добавляет пользователя
  addUser(gameID, teamID, data) {
    this._body[teamID][gameID] = [gameID, teamID, this.getDefaultBody()];

    if (typeof data === 'object') {
      this.updateUser(gameID, teamID, data);
    }
  }

  // удаляет пользователя и возвращает его данные
  removeUser(gameID, teamID) {
    let data = this._body[teamID][gameID];
    const stat = {};

    delete this._body[teamID][gameID];
    this._lastBody.set(`${data[0]}|${data[1]}`, [null]);

    data = data[2];

    // преобразование данных пользователя из массива в объект и
    // обновление head
    for (const p in this._config) {
      if (this._config.hasOwnProperty(p)) {
        const conf = this._config[p];
        const value = data[conf.key];

        stat[p] = value;

        if (conf.headSync === true) {
          this.updateHeadSync(teamID, p, true);
        }
      }
    }

    return stat;
  }

  // перемещает пользователя в новую команду
  moveUser(gameID, teamID, newTeamID) {
    this.addUser(gameID, newTeamID, this.removeUser(gameID, teamID));
  }

  // обновляет статистику пользователя
  updateUser(gameID, teamID, data) {
    const stat = this._body[teamID][gameID];

    for (const p in data) {
      if (data.hasOwnProperty(p)) {
        const conf = this._config[p];
        const method = conf.bodyMethod;
        const value = data[p];

        // если метод 'замена'
        if (method === '=') {
          stat[2][conf.key] = value;

          // иначе если метод 'добавление'
        } else if (method === '+') {
          stat[2][conf.key] += value;
        }

        if (conf.headSync === true) {
          this.updateHeadSync(teamID, p, true);
        }
      }
    }

    this._lastBody.set(`${stat[0]}|${stat[1]}`, stat.slice(2));
  }

  // обновляет статистику head
  updateHead(teamID, param, value) {
    const stat = this._head[teamID];
    const conf = this._config[param];
    const method = conf.headMethod;
    const key = conf.key;

    // если метод 'добавление'
    if (method === '+') {
      stat[1][key] += value;

      // если метод 'замена'
    } else if (method === '=') {
      stat[1][key] = value;
    }

    this._lastHead.set(stat[0], stat.slice(1));
  }

  // обновляет статистику head синхронизированную с body
  updateHeadSync(teamID, param, save) {
    const stat = this._head[teamID];
    const bodyStats = this._body[teamID];
    const conf = this._config[param];
    const method = conf.headMethod;
    const key = conf.key;
    let value;

    // если метод 'количество'
    if (method === '#') {
      value = Object.keys(bodyStats).length;

      // иначе если метод 'добавление'
    } else if (method === '+') {
      value = 0;

      for (const p in bodyStats) {
        if (bodyStats.hasOwnProperty(p)) {
          value += bodyStats[p][2][key];
        }
      }
    }

    stat[1][key] = value;

    if (save === true) {
      this._lastHead.set(stat[0], stat.slice(1));
    }
  }

  // возвращает последние изменения
  getLast() {
    const lastBody = [];
    const lastHead = [];

    for (const [key, data] of this._lastBody) {
      const [k1, k2] = key.split('|');
      lastBody.push([k1, Number(k2), ...data]);
    }

    for (const [key, data] of this._lastHead) {
      lastHead.push([key, ...data]);
    }

    let stat = [lastBody, lastHead];

    this._lastBody.clear();
    this._lastHead.clear();

    if (!stat[0].length && !stat[1].length) {
      stat = 0;
    }

    return stat;
  }

  // возвращает полную статистику
  getFull() {
    let stat = [];

    stat[0] = [];
    stat[1] = [];

    for (const teamID in this._body) {
      if (this._body.hasOwnProperty(teamID)) {
        const bodyStats = this._body[teamID];

        for (const gameID in bodyStats) {
          if (bodyStats.hasOwnProperty(gameID)) {
            stat[0].push(bodyStats[gameID]);
          }
        }
      }
    }

    for (const teamID in this._head) {
      if (this._head.hasOwnProperty(teamID)) {
        stat[1].push(this._head[teamID]);
      }
    }

    if (!stat[0].length && !stat[1].length) {
      stat = 0;
    }

    return stat;
  }
}

export default Stat;
