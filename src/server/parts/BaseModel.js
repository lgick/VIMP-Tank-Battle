class BaseModel {
  constructor(data) {
    this._model = data.model;
    this._name = data.name;
    this._teamID = data.teamID;
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
  }

  get teamID() {
    return this._teamID;
  }

  set teamID(teamID) {
    this._teamID = teamID;
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

  get weaponRemainingCooldowns() {
    return this._weaponRemainingCooldowns;
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
  }

  // меняет имя игрока
  changeName(name) {
    this._name = name;
    this._fullUserData = true;
  }
}

export default BaseModel;
