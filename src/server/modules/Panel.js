// Singleton Panel
let panel;

class Panel {
  constructor(config) {
    let counter = 0;

    if (panel) {
      return panel;
    }

    panel = this;

    this._config = config;
    this._emptyPanel = [];

    this._data = {};

    for (const p in this._config) {
      if (this._config.hasOwnProperty(p)) {
        this._emptyPanel[counter] = '';
        counter += 1;
      }
    }
  }

  // сбрасывает данные пользователей
  reset() {
    for (const gameID in this._data) {
      if (this._data.hasOwnProperty(gameID)) {
        const user = this._data[gameID];

        user.values = this.getDefault(user.values);
        user.status = true;
      }
    }
  }

  // возвращает дефолтные данные
  getDefault(panel = []) {
    for (const p in this._config) {
      if (this._config.hasOwnProperty(p)) {
        const conf = this._config[p];

        if (typeof conf.value !== 'undefined') {
          panel[conf.key] = conf.value;
        }
      }
    }

    return panel;
  }

  // добавляет пользователя
  addUser(gameID) {
    this._data[gameID] = {
      values: this.getDefault(),
      status: true,
    };
  }

  // удаляет пользователя
  removeUser(gameID) {
    delete this._data[gameID];
  }

  // обновляет данные пользователя
  updateUser(gameID, param, value) {
    const user = this._data[gameID];
    const conf = this._config[param];
    const method = conf.method;
    const minValue = conf.minValue;
    const key = conf.key;

    // если метод 'уменьшение'
    if (method === '-') {
      value = user.values[key] - value;

      // иначе если метод 'замена'
    } else if (method === '=') {
    }

    // если есть минимально допустимое значение и оно больше текущего
    if (typeof minValue !== 'undefined' && value < minValue) {
      value = minValue;
    }

    user.values[key] = value;
    user.status = true;
  }

  // возвращает данные
  getPanel(gameID) {
    const user = this._data[gameID];

    if (user && user.status === true) {
      user.status = false;

      return user.values;
    }
  }

  // возвращает пустые данные
  getEmpty() {
    return this._emptyPanel;
  }
}

export default Panel;
