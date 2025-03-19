class BaseModel {
  constructor(data) {
    this._model = data.model;
    this._name = data.name;
    this._teamID = data.teamID;
    this._currentBullet = data.currentBullet;
    this._bullets = data.bullets;
    this._bulletList = data.bulletList;
    this._keysData = data.keysData;

    this._bulletConstructorName =
      this._bullets[this._currentBullet].constructor || null;
    this._fullUserData = true;
    this._currentKeys = null;
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

  get currentBullet() {
    return this._currentBullet;
  }

  get bulletConstructorName() {
    return this._bulletConstructorName;
  }

  // меняет модель пуль игрока
  turnUserBullet(back) {
    let key = this._bulletList.indexOf(this._currentBullet);

    if (back) {
      key -= 1;
    } else {
      key += 1;
    }

    if (key < 0) {
      key = this._bulletList.length - 1;
    } else if (key >= this._bulletList.length) {
      key = 0;
    }

    this._currentBullet = this._bulletList[key];
    this._bulletConstructorName =
      this._bullets[this._currentBullet].constructor;
  }

  // меняет имя игрока
  changeName(name) {
    this._name = name;
    this._fullUserData = true;
  }
}

export default BaseModel;
