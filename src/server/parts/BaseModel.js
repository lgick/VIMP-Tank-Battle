class BaseModel {
  constructor(data) {
    this._model = data.model;
    this._name = data.name;
    this._gameId = data.gameId;
    this._teamId = data.teamId;
    this._currentWeapon = data.currentWeapon;
    this._weapons = data.weapons;
    this._availableWeaponList = Object.keys(this._weapons);
    this._keysData = data.keysData;
    this._services = data.services;

    this._weaponConstructorType =
      this._weapons[this._currentWeapon].type || null;
    this._fullUserData = true;
    this._currentKeys = null;

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

  get currentKeys() {
    return this._currentKeys;
  }

  set currentKeys(keys) {
    this._currentKeys = keys;
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

  // получает текущее здоровье
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
