// Singleton Panel

let panel;

class Panel {
  constructor(config) {
    if (panel) {
      return panel;
    }

    panel = this;

    this._config = config;
    this._data = {};
    this._timerManager = null;
    this._emptyPanel = Object.values(this._config).map(item => item.key);
    this._defaultPanel = {};

    for (const key of Object.keys(this._config)) {
      this._defaultPanel[key] = this._config[key].value;
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

        user.values = { ...this._defaultPanel };
        user.status = true;
      }
    }
  }

  // добавляет пользователя
  addUser(gameId) {
    this._data[gameId] = {
      values: { ...this._defaultPanel },
      activeWeapon: null,
      status: true,
    };
  }

  // удаляет пользователя
  removeUser(gameId) {
    delete this._data[gameId];
  }

  // обновляет данные пользователя
  // param: имя параметра из _config (например, 'health', 'w1')
  // value: значение
  // operation: 'set', 'decrement', 'increment'
  updateUser(gameId, param, value, operation = 'decrement') {
    const user = this._data[gameId];
    const currentValue = user.values[param];
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

    user.values[param] = newValue;
    user.status = true;
  }

  // устанавливает активное оружие
  setActiveWeapon(gameId, weaponKey) {
    const user = this._data[gameId];

    user.activeWeapon = weaponKey;
    user.status = true;
  }

  // проверяет, достаточно ли у пользователя ресурсов для действия
  hasResources(gameId, param, value) {
    const user = this._data[gameId];
    const currentValue = user.values[param];

    return currentValue >= value;
  }

  // возвращает текущее значение параметра для пользователя
  getCurrentValue(gameId, param) {
    const user = this._data[gameId];

    return user.values[param];
  }

  // возвращает данные
  getPanel(gameId) {
    const user = this._data[gameId];
    const data = this.getTime();

    if (user.status === true) {
      user.status = false;
      const values = user.values;

      // если активное оружие изменилось
      if (user.activeWeapon) {
        data.push(`wa:${user.activeWeapon}`);
        user.activeWeapon = null; // сброс после отправки
      }

      // остальные данные игрока
      for (const param in values) {
        if (Object.hasOwn(values, param)) {
          const key = this._config[param].key;
          const value = values[param];

          data.push(`${key}:${value}`);
        }
      }
    } else {
      // даже если статус не true, всегда отправляем время
      return data;
    }

    return data;
  }

  // возвращает пустые данные (ключи без значений)
  // требуется, чтоб скрыть контейнеры этих данных
  getEmptyPanel() {
    return this.getTime().concat(this._emptyPanel);
  }

  getTime() {
    return [`t:${this._timerManager.getRoundTimeLeft()}`];
  }
}

export default Panel;
