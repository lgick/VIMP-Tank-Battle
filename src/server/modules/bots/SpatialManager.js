/**
 * @class SpatialManager
 * @description Разделяет игровой мир на сетку ячеек для оптимизации поиска ближайших соседей.
 * Позволяет снизить сложность поиска целей с O(N^2) до приближенного O(N) или O(1) для запроса.
 */
class SpatialManager {
  /**
   * @param {number} cellSize - Размер стороны одной квадратной ячейки сетки (в игровых юнитах).
   * Должен быть сравним с максимальным радиусом взаимодействия (например, дальностью стрельбы).
   */
  constructor(cellSize = 500) {
    this._cellSize = cellSize;
    // Хранилище ячеек: ключ 'cx,cy', значение Set<EntityData>
    this._grid = new Map();
  }

  /**
   * @description Очищает сетку перед новым кадром.
   */
  clear() {
    this._grid.clear();
  }

  /**
   * @description Генерирует уникальный строковый ключ для ячейки по координатам.
   * @private
   */
  _getCellKey(x, y) {
    const cx = Math.floor(x / this._cellSize);
    const cy = Math.floor(y / this._cellSize);
    return `${cx},${cy}`;
  }

  /**
   * @description Добавляет сущность (игрока/бота) в сетку.
   * @param {object} entity - Данные сущности.
   * @param {string} entity.gameId
   * @param {number} entity.teamId
   * @param {number} entity.x - Координата X
   * @param {number} entity.y - Координата Y
   */
  insert(entity) {
    const key = this._getCellKey(entity.x, entity.y);

    if (!this._grid.has(key)) {
      this._grid.set(key, []);
    }

    // Сохраняем только необходимые данные для быстрой фильтрации
    this._grid.get(key).push({
      gameId: entity.gameId,
      teamId: entity.teamId,
      // x, y можно не сохранять, они нужны были только для определения ячейки,
      // но могут пригодиться для первичной грубой проверки.
      x: entity.x,
      y: entity.y,
    });
  }

  /**
   * @description Возвращает список всех сущностей в ячейке,
   * содержащей позицию, и в 8 соседних ячейках.
   * @param {number} x - Координата X центра поиска.
   * @param {number} y - Координата Y центра поиска.
   * @returns {Array<object>} Массив кандидатов (gameId, teamId, x, y).
   */
  queryNearby(x, y) {
    const centerCx = Math.floor(x / this._cellSize);
    const centerCy = Math.floor(y / this._cellSize);
    const candidates = [];

    // Перебор 3x3 ячеек вокруг центра
    for (let cy = centerCy - 1; cy <= centerCy + 1; cy += 1) {
      for (let cx = centerCx - 1; cx <= centerCx + 1; cx += 1) {
        const key = `${cx},${cy}`;
        const cellEntities = this._grid.get(key);

        if (cellEntities) {
          // Быстро добавляем содержимое ячейки в общий список (spread operator)
          candidates.push(...cellEntities);
        }
      }
    }

    return candidates;
  }

  /**
   * @description Позволяет изменить размер ячейки (например, при смене карты).
   */
  setCellSize(newSize) {
    this._cellSize = newSize;
    this.clear();
  }
}

export default SpatialManager;
