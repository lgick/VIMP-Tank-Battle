/**
 * Поддерживаемые форматы ID для бинарной упаковки
 */
export const ID_FORMATS = {
  UINT8: 'Uint8', // 1 .. 255
  UINT16: 'Uint16', // 1 .. 65535
  UINT32: 'Uint32', // 1 .. 4294967295
};

/**
 * Максимальные значения для каждого формата
 */
const LIMITS = {
  [ID_FORMATS.UINT8]: 0xff, // 255
  [ID_FORMATS.UINT16]: 0xffff, // 65535
  [ID_FORMATS.UINT32]: 0xffffffff, // 4294967295
};

export default class IdGenerator {
  /**
   * @param {string} format - Формат из ID_FORMATS
   * (например, ID_FORMATS.UINT16)
   * @param {number} [startFrom=1] - Начальное значение
   * (опционально, по умолчанию 1)
   */
  constructor(format, startFrom = 1) {
    if (LIMITS[format] === undefined) {
      throw new Error(
        `IdGenerator: Unknown format "${format}". Use ID_FORMATS.`,
      );
    }

    this.max = LIMITS[format];
    this.current = startFrom;
    this.start = startFrom;
  }

  /**
   * Возвращает следующий ID и увеличивает счетчик.
   * При достижении максимума сбрасывается в startFrom.
   * @returns {number}
   */
  next() {
    const id = this.current;

    // инкремент
    this.current += 1;

    // проверка переполнения
    if (this.current > this.max) {
      this.current = this.start;
    }

    return id;
  }

  /**
   * Сбрасывает генератор в начальное значение
   */
  reset() {
    this.current = this.start;
  }
}
