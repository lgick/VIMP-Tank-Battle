// Singleton Stat

let stat;

class Stat {
  constructor(config, teams) {
    if (stat) {
      return stat;
    }

    stat = this;

    this._config = config;

    this._head = new Map();
    this._body = new Map();

    this._lastHead = [];
    this._lastBody = [];

    for (const p in teams) {
      if (Object.hasOwn(teams, p)) {
        const teamId = teams[p];

        this._head.set(teamId, [teamId, []]);
        this._body.set(teamId, new Map());
      }
    }
  }

  // сбрасывает статистику
  reset() {
    for (const bodyStats of this._body.values()) {
      for (const stat of bodyStats.values()) {
        stat[2] = this._getDefaultBody(stat[2]);
        this._lastBody.push(stat);
      }
    }

    for (const [teamId, stat] of this._head) {
      for (const p in this._config) {
        if (Object.hasOwn(this._config, p)) {
          const conf = this._config[p];

          if (conf.headSync) {
            this._updateHeadSync(teamId, p);
          } else if (typeof conf.headValue !== 'undefined') {
            stat[1][conf.key] = conf.headValue;
          }
        }
      }

      this._lastHead.push(stat);
    }
  }

  // возвращает дефолтные данные для body
  _getDefaultBody(stat = []) {
    for (const p in this._config) {
      if (Object.hasOwn(this._config, p)) {
        const conf = this._config[p];

        if (typeof conf.bodyValue !== 'undefined') {
          stat[conf.key] = conf.bodyValue;
        }
      }
    }

    return stat;
  }

  // добавляет пользователя
  addUser(gameId, teamId, data) {
    const teamStats = this._body.get(teamId);

    // добавление данных по умолчанию из конфига
    const newUserStat = [gameId, teamId, this._getDefaultBody()];

    teamStats.set(gameId, newUserStat);

    // обновление данных игрока (имя, статус...)
    this.updateUser(gameId, teamId, data);
  }

  // удаляет пользователя и возвращает его данные
  removeUser(gameId, teamId) {
    const teamStats = this._body.get(teamId);
    const stat = teamStats.get(gameId);
    const data = {};

    if (!stat) {
      return;
    }

    teamStats.delete(gameId);
    this._lastBody.push([stat[0], stat[1], null]);

    const userData = stat[2];

    // преобразование данных пользователя из массива в объект и обновление head
    for (const p in this._config) {
      if (Object.hasOwn(this._config, p)) {
        const conf = this._config[p];
        const value = userData[conf.key];

        data[p] = value;

        if (conf.headSync === true) {
          this._updateHeadSync(teamId, p, true);
        }
      }
    }

    return data;
  }

  // перемещает пользователя в новую команду
  moveUser(gameId, teamId, newTeamId, data = {}) {
    const userData = this.removeUser(gameId, teamId) || {};

    this.addUser(gameId, newTeamId, { ...userData, ...data });
  }

  // обновляет статистику пользователя
  updateUser(gameId, teamId, data) {
    const stat = this._body.get(teamId).get(gameId);

    if (!stat) {
      return;
    }

    for (const p in data) {
      if (Object.hasOwn(data, p)) {
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
          this._updateHeadSync(teamId, p, true);
        }
      }
    }

    this._lastBody.push(stat);
  }

  // обновляет статистику head
  updateHead(teamId, param, value) {
    const stat = this._head.get(teamId);
    const conf = this._config[param];
    const method = conf.headMethod;

    // если метод 'добавление'
    if (method === '+') {
      stat[1][conf.key] += value;

      // если метод 'замена'
    } else if (method === '=') {
      stat[1][conf.key] = value;
    }

    this._lastHead.push(stat);
  }

  // обновляет статистику head синхронизированную с body
  _updateHeadSync(teamId, param, save) {
    const stat = this._head.get(teamId);
    const bodyStats = this._body.get(teamId);
    const conf = this._config[param];
    const method = conf.headMethod;
    const key = conf.key;
    let value;

    // если метод 'количество'
    if (method === '#') {
      value = bodyStats.size;

      // иначе если метод 'добавление'
    } else if (method === '+') {
      value = 0;

      for (const item of bodyStats.values()) {
        value += item[2][key];
      }
    }

    stat[1][key] = value;

    if (save === true) {
      this._lastHead.push(stat);
    }
  }

  // возвращает последние изменения
  getLast() {
    let stat = [this._lastBody, this._lastHead];

    this._lastBody = [];
    this._lastHead = [];

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

    for (const bodyStats of this._body.values()) {
      for (const playerStat of bodyStats.values()) {
        stat[0].push(playerStat);
      }
    }

    for (const headStat of this._head.values()) {
      stat[1].push(headStat);
    }

    if (!stat[0].length && !stat[1].length) {
      stat = 0;
    }

    // true указывает, что обновление статистики полное
    stat[2] = true;

    return stat;
  }
}

export default Stat;
