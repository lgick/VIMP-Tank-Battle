class BaseModel {
  constructor(data) {
    this._model = data.model;
    this._name = data.name;
    this._gameId = data.gameId;
    this._teamId = data.teamId;
    this._currentWeapon = data.currentWeapon;
    this._weapons = data.weapons;
    this._availableWeaponList = Object.keys(this._weapons);
    this._keysData = data.playerKeys.keys;
    this._services = data.services;

    this._weaponConstructorType =
      this._weapons[this._currentWeapon].type || null;
    this._fullUserData = true;

    // битмаска текущего состояния нажатых клавиш
    this._currentKeys = 0;

    // битмаска команд, которые нужно обработать один раз в этом тике
    this._oneShotEvents = 0;

    // одноразовые команды
    this._oneShotKeysMask = data.playerKeys.oneShotMask;

    // инициализация кулдаунов оружия
    this._weaponRemainingCooldowns = {};

    // изначально все оружие готово к выстрелу
    for (const weaponName in this._weapons) {
      if (Object.hasOwn(this._weapons, weaponName)) {
        this._weaponRemainingCooldowns[weaponName] = 0;
      }
    }

    this._services.panel.setActiveWeapon(this._gameId, this._currentWeapon);
  }

  get gameId() {
    return this._gameId;
  }

  get teamId() {
    return this._teamId;
  }

  set teamId(teamId) {
    this._teamId = teamId;
  }

  get fullUserData() {
    return this._fullUserData;
  }

  set fullUserData(bool) {
    this._fullUserData = bool;
  }

  get name() {
    return this._name;
  }

  set name(name) {
    this._name = name;
  }

  get keysData() {
    return this._keysData;
  }

  set keysData(data) {
    this._keysData = data;
  }

  get model() {
    return this._model;
  }

  get currentWeapon() {
    return this._currentWeapon;
  }

  get weaponConstructorType() {
    return this._weaponConstructorType;
  }

  get weapons() {
    return this._weapons;
  }

  // обновляет состояние клавиш
  // принимает данные: { action: 'down' | 'up', name: 'fire' }
  updateKeys(data) {
    const { name, action } = data;
    const keyBit = this._keysData[name];

    // если клавиши не найдено
    if (keyBit === undefined) {
      return;
    }

    if (action === 'down') {
      // если one-shot клавиша, добавление в очередь событий для текущего тика
      if (this._oneShotKeysMask & keyBit) {
        this._oneShotEvents |= keyBit;
        // иначе просто обновление состояния
      } else {
        this._currentKeys |= keyBit;
      }
      // если отпускание, обновить состояние
    } else if (action === 'up') {
      this._currentKeys &= ~keyBit;
    }
  }

  // возвращает клавиши для обработки
  getKeysForProcessing() {
    // комбинация всех клавиш
    const keys = this._currentKeys | this._oneShotEvents;

    // сброс одноразовых событий,
    // т.к. они будут обработаны в этом тике
    this._oneShotEvents = 0;

    return keys;
  }

  // сброс нажатых клавиш
  resetKeys() {
    this._currentKeys = 0;
    this._oneShotEvents = 0;
  }

  // возвращает текущее здоровье
  getHealth() {
    const panel = this._services.panel;

    return panel.getCurrentValue(this._gameId, 'health');
  }

  // задаёт значение здоровья
  setHealth(newHealth) {
    const panel = this._services.panel;

    panel.updateUser(this._gameId, 'health', newHealth, 'set');
  }

  // проверяет кулдауны и патроны
  tryConsumeAmmoAndShoot() {
    const weaponName = this.currentWeapon;
    const weaponConfig = this.weapons[weaponName];
    const consumption = weaponConfig.consumption || 1;
    const panel = this._services.panel;

    if (
      this._weaponRemainingCooldowns[weaponName] <= 0 &&
      panel.hasResources(this._gameId, weaponName, consumption)
    ) {
      // списание патронов
      panel.updateUser(this._gameId, weaponName, consumption, 'decrement');

      // установка кулдауна
      this._weaponRemainingCooldowns[weaponName] = weaponConfig.fireRate;

      return true;
    }

    return false;
  }

  // обновляет кулдауны оружия
  updateRemainingCooldowns(dt) {
    for (const weaponName in this._weaponRemainingCooldowns) {
      if (this._weaponRemainingCooldowns[weaponName] > 0) {
        this._weaponRemainingCooldowns[weaponName] -= dt;
      }

      this._weaponRemainingCooldowns[weaponName] = Math.max(
        0,
        this._weaponRemainingCooldowns[weaponName],
      );
    }
  }

  // меняет оружие игрока
  turnUserWeapon(back) {
    let key = this._availableWeaponList.indexOf(this._currentWeapon);

    if (back) {
      key -= 1;
    } else {
      key += 1;
    }

    if (key < 0) {
      key = this._availableWeaponList.length - 1;
    } else if (key >= this._availableWeaponList.length) {
      key = 0;
    }

    this._currentWeapon = this._availableWeaponList[key];
    this._weaponConstructorType = this._weapons[this._currentWeapon].type;

    // сообщаем сервису панели, что активное оружие изменилось
    this._services.panel.setActiveWeapon(this._gameId, this._currentWeapon);
  }

  // меняет имя игрока
  changeName(name) {
    this._name = name;
    this._fullUserData = true;
  }
}

export default BaseModel;
