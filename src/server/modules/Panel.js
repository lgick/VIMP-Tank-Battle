// Singleton Panel
let panel;

class Panel {
  constructor(config, game) {
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

    this._game = game;
    this._game.publisher.on('updateUserPanel', this.updateUser, this);
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
  // param: имя параметра из _config (например, 'health', 'bullet')
  // value: значение
  // operation: 'set', 'decrement', 'increment'
  updateUser({ gameID, param, value, operation = 'decrement' }) {
    const conf = this._config[param];
    const key = conf.key;
    const user = this._data[gameID];
    const currentValue = user.values[key];
    let newValue;

    if (operation === 'set') {
      newValue = value;
    } else if (operation === 'decrement') {
      newValue = currentValue - value;
    } else if (operation === 'increment') {
      newValue = currentValue + value;
    }

    if (newValue < 0) {
      newValue = 0;
    }

    user.values[key] = newValue;
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
