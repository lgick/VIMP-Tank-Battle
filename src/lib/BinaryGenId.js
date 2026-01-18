/**
 * Поддерживаемые форматы ID для бинарной упаковки
 */
export const ID_FORMATS = {
  // 8 бит индекс, 8 бит поколение
  // итоговый ID: 16 бит (Uint16)
  UINT8: 'Uint8',
  // 16 бит индекс, 16 бит поколение
  // итоговый ID: 32 бита (Uint32)
  UINT16: 'Uint16',
};

const CONFIG = {
  [ID_FORMATS.UINT8]: {
    maxIndex: 0xff, // 255
    indexMask: 0xff, // маска для извлечения индекса
    genBits: 8, // сдвиг для поколения
    genMask: 0xff, // маска для сброса поколения (255 -> 0)
    GenArray: Uint8Array, // массив поколений (достаточно 8 бит)
    StackArray: Uint8Array, // стек свободных индексов
  },
  [ID_FORMATS.UINT16]: {
    maxIndex: 0xffff, // 65535
    indexMask: 0xffff, // маска для извлечения индекса
    genBits: 16, // сдвиг для поколения
    genMask: 0xffff, // маска для сброса поколения (65535 -> 0)
    GenArray: Uint16Array, // массив поколений (нужно 16 бит)
    StackArray: Uint16Array, // стек свободных индексов
  },
};

/**
 * Генератор ID для ArrayBuffer.
 * Упаковывает Индекс и Поколение в одно число (Uint16 или Uint32).
 * Обеспечивает защиту от stale references и прямую совместимость с DataView.
 */
export default class BinaryGenId {
  constructor(format = ID_FORMATS.UINT16) {
    const cfg = CONFIG[format];

    if (!cfg) {
      throw new Error(`BinaryGenId: Unknown format: ${format}`);
    }

    this._maxIndex = cfg.maxIndex;
    this._indexMask = cfg.indexMask;
    this._shift = cfg.genBits;
    this._genMask = cfg.genMask;

    // емкость = maxIndex + 1 (так как 0 исключен, но массив 0-based)
    // индекс 0 в массивах будет пустым
    const capacity = this._maxIndex + 1;

    // массив поколений
    this._generations = new cfg.GenArray(capacity);

    // стек свободных индексов
    this._free = new cfg.StackArray(this._maxIndex);

    this._fillStack();
  }

  /**
   * Заполняет стек индексами в обратном порядке (max ... 1)
   * Индекс 0 в стек не попадает и считается зарезервированным/невалидным.
   * @private
   */
  _fillStack() {
    for (let i = 0; i < this._maxIndex; i += 1) {
      this._free[i] = this._maxIndex - i;
    }

    this._freeTop = this._maxIndex - 1;
  }

  /**
   * Выдает следующий свободный ID.
   * @returns {number} Упакованный ID (Index | Gen << Shift)
   * @throws {Error} Если свободные ID закончились.
   */
  next() {
    if (this._freeTop < 0) {
      throw new Error('BinaryGenId: Out of IDs');
    }

    // свободный индекс
    const index = this._free[this._freeTop--];

    // текущее поколение по индексу
    const gen = this._generations[index];

    // упаковка
    // (gen << this.shift) сдвигает поколение в старшие биты
    // | index добавляет индекс в младшие биты
    // >>> 0 гарантирует, что результат будет Unsigned 32-bit Integer
    // (важно для UINT16)
    return ((gen << this._shift) | index) >>> 0;
  }

  /**
   * Освобождает ID для повторного использования.
   * Увеличивает поколение слота, делая старые ссылки на этот ID невалидными.
   * Игнорирует повторные вызовы (защита от double-free).
   * @param {number} id Упакованный ID
   */
  release(id) {
    // распаковка индекса
    const index = id & this._indexMask;

    // проверка границ и 0
    if (index === 0) {
      return;
    }

    // распаковка поколения (старшие биты)
    const gen = id >>> this._shift;

    // если поколение в массиве не совпадает с поколением в ID,
    // значит этот ID уже был освобожден и, возможно, перевыдан
    if (this._generations[index] !== gen) {
      return;
    }

    // увеличение поколения для следующего использования
    // & this.genMask обеспечивает цикличность (255 -> 0 для UINT8)
    this._generations[index] = (this._generations[index] + 1) & this._genMask;

    // возврат индекса в стек
    this._free[++this._freeTop] = index;
  }

  /**
   * Проверяет, является ли ID валидным
   * (существует и не был удален/пересоздан).
   * @param {number} id Проверяемый ID.
   * @returns {boolean} true, если ID валиден.
   */
  isValid(id) {
    // если 0, null, undefined
    if (!id) {
      return false;
    }

    const index = id & this._indexMask;

    // проверка границ (если id пришел битый)
    if (index === 0) {
      return false;
    }

    const gen = id >>> this._shift;

    // сравнение поколений
    return this._generations[index] === gen;
  }

  /**
   * Полностью сбрасывает состояние генератора.
   * Обнуляет поколения и восстанавливает стек свободных индексов.
   */
  reset() {
    this._generations.fill(0);
    this._fillStack();
  }
}
