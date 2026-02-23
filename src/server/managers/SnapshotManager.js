// Singleton SnapshotManager

let snapshotManager;

// TODO ARRAYBUFFER
// stash@{0}: WIP on refactor: bb6036e game
// stash@{1}: WIP on refactor: c3dfdff game
// https://chatgpt.com/c/698e4c64-50d0-832b-861f-7c005eebef28
// https://aistudio.google.com/prompts/1PcQGomr1IH95JwrH0p4CyeKUel5TD1Iy

class SnapshotManager {
  /**
   * @param {Game} game - Экземпляр игры (для получения данных)
   * @param {number} sendRate - Частота отправки
   * (1 = каждый тик, 2 = через один и т.д.)
   */
  constructor(game, sendRate) {
    if (snapshotManager) {
      return snapshotManager;
    }

    snapshotManager = this;

    this._game = game;
    this._sendRate = Math.max(1, sendRate || 1);
    this._tickCounter = 0;

    // буфер для накопления событий (выстрелы, эффекты) между отправками
    this._eventsBuffer = {};
  }

  /**
   * Вызывается каждый тик игрового цикла.
   * @returns {Object|null} Возвращает готовый пакет данных для отправки
   * или null, если отправка пропущена.
   */
  processTick() {
    // сбор событий (high frequency)
    // забираем быстрые события каждый тик,
    // чтобы ничего не пропустить
    const events = this._game.getEvents();

    if (events) {
      this._mergeEvents(events);
    }

    // контроль частоты
    this._tickCounter += 1;

    if (this._tickCounter < this._sendRate) {
      return null; // пропуск отправки
    }

    this._tickCounter = 0;

    // сбор состояния (low frequency)
    // сбор тяжелых данных (координаты всех игроков) только в момент отправки
    const worldState = this._game.getWorldState();

    // формирование пакета
    // наложение накопленных событий на состояние мира
    const snapshot = worldState;

    for (const key in this._eventsBuffer) {
      if (Object.hasOwn(this._eventsBuffer, key)) {
        const bufferedValue = this._eventsBuffer[key];

        // если в snapshot уже есть такой ключ
        if (snapshot[key]) {
          if (Array.isArray(snapshot[key]) && Array.isArray(bufferedValue)) {
            snapshot[key].push(...bufferedValue);
          } else {
            // мёрж объектов
            Object.assign(snapshot[key], bufferedValue);
          }
        } else {
          // если ключа нет, добавление
          snapshot[key] = bufferedValue;
        }
      }
    }

    // очистка буфера
    this._eventsBuffer = {};

    return snapshot;
  }

  /**
   * Сбрасывает состояние менеджера (например, при смене карты)
   */
  reset() {
    this._tickCounter = 0;
    this._eventsBuffer = {};
  }

  /**
   * Эффективно объединяет новые события с буфером
   * @private
   */
  _mergeEvents(newEvents) {
    for (const key in newEvents) {
      if (Object.hasOwn(newEvents, key)) {
        const val = newEvents[key];

        if (Array.isArray(val)) {
          if (!this._eventsBuffer[key]) {
            this._eventsBuffer[key] = [];
          }

          this._eventsBuffer[key].push(...val);
        } else {
          this._eventsBuffer[key] = this._eventsBuffer[key] || {};
          Object.assign(this._eventsBuffer[key], val);
        }
      }
    }
  }
}

export default SnapshotManager;
