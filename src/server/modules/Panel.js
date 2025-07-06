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
    this._timerManager = null;

    for (const p in this._config) {
      if (Object.hasOwn(this._config, p)) {
        this._emptyPanel[counter] = '';
        counter += 1;
      }
    }
  }

  // внедряет зависимость TimerManager
  injectTimerManager(timerManager) {
    this._timerManager = timerManager;
  }

  // сбрасывает данные пользователей
  reset() {
    for (const gameId in this._data) {
      if (Object.hasOwn(this._data, gameId)) {
        const user = this._data[gameId];

        user.values = this.getDefault(user.values);
        user.status = true;
      }
    }
  }

  // возвращает дефолтные данные
  getDefault(panel = []) {
    for (const p in this._config) {
      if (Object.hasOwn(this._config, p)) {
        const conf = this._config[p];

        if (typeof conf.value !== 'undefined') {
          panel[conf.key] = conf.value;
        }
      }
    }

    return panel;
  }

  // добавляет пользователя
  addUser(gameId) {
    this._data[gameId] = {
      values: this.getDefault(),
      status: true,
    };
  }

  // удаляет пользователя
  removeUser(gameId) {
    delete this._data[gameId];
  }

  // обновляет данные пользователя
  // param: имя параметра из _config (например, 'health', 'bullet')
  // value: значение
  // operation: 'set', 'decrement', 'increment'
  updateUser(gameId, param, value, operation = 'decrement') {
    const conf = this._config[param];
    const key = conf.key;
    const user = this._data[gameId];
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

  // проверяет, достаточно ли у пользователя ресурсов для действия
  hasResources(gameId, param, value) {
    const user = this._data[gameId];
    const conf = this._config[param];

    if (user && conf) {
      const currentValue = user.values[conf.key];
      return currentValue >= value;
    }
  }

  // возвращает текущее значение параметра для пользователя
  getCurrentValue(gameId, param) {
    const user = this._data[gameId];
    const conf = this._config[param];

    if (user && conf) {
      return user.values[conf.key];
    }
  }

  // возвращает данные
  getPanel(gameId) {
    const user = this._data[gameId];
    let data = [this._timerManager.getRoundTimeLeft()];

    if (user && user.status === true) {
      user.status = false;

      data = data.concat(user.values);
    }

    return data;
  }

  // возвращает пустые данные (пустые строки)
  // требуется, чтоб скрыть контейнеры этих данных
  getEmptyPanel() {
    return [this._timerManager.getRoundTimeLeft(), ...this._emptyPanel];
  }

  getTime() {
    return [this._timerManager.getRoundTimeLeft()];
  }
}

export default Panel;
