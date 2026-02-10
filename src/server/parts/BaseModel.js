class BaseModel {
  constructor(data) {
    this._gameId = data.gameId;
    this._teamId = data.teamId;
    this._model = data.model;
    this._size = data.modelData.size;
    this._keysData = data.playerKeys.keys;
    // одноразовые команды
    this._oneShotKeysMask = data.playerKeys.oneShotMask;

    // битмаска текущего состояния нажатых клавиш
    this._currentKeys = 0;

    // битмаска команд, которые нужно обработать один раз в тике
    this._oneShotEvents = 0;
  }

  get gameId() {
    return this._gameId;
  }

  get size() {
    return this._size;
  }

  get teamId() {
    return this._teamId;
  }

  set teamId(teamId) {
    this._teamId = teamId;
  }

  get model() {
    return this._model;
  }

  get keysData() {
    return this._keysData;
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
}

export default BaseModel;
