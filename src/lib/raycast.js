// 2D raycast-примитивы для клиентского предсказания выстрелов (Фаза 5c):
// приближённая реплика серверного world.castRay по данным, которые уже есть
// у клиента (тайловая сетка стен, прямоугольники динамики карты и танков).
// Чистые функции без зависимостей от Pixi/Rapier.

/**
 * Луч против тайловой сетки стен (DDA-обход клеток).
 * @param {{x: number, y: number}} origin - Начало луча (мировые координаты).
 * @param {{x: number, y: number}} dir - Нормализованное направление.
 * @param {number} range - Максимальная дистанция.
 * @param {Object} grid
 * @param {Array<Array>} grid.map - Двумерный массив тайлов.
 * @param {Array} grid.solidTiles - Значения тайлов, являющихся стеной.
 * @param {number} grid.tileSize - Размер тайла в мировых единицах.
 * @returns {number|null} Дистанция до стены или null (промах).
 */
export const rayVsGrid = (origin, dir, range, { map, solidTiles, tileSize }) => {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;

  if (rows === 0 || cols === 0 || solidTiles.length === 0) {
    return null;
  }

  const isSolid = (cx, cy) =>
    cy >= 0 &&
    cy < rows &&
    cx >= 0 &&
    cx < cols &&
    solidTiles.indexOf(map[cy][cx]) !== -1;

  let cellX = Math.floor(origin.x / tileSize);
  let cellY = Math.floor(origin.y / tileSize);

  // старт внутри стены — попадание в упор
  if (isSolid(cellX, cellY)) {
    return 0;
  }

  const stepX = dir.x > 0 ? 1 : -1;
  const stepY = dir.y > 0 ? 1 : -1;

  // дистанция вдоль луча на пересечение одной клетки по каждой оси
  const deltaX = dir.x !== 0 ? Math.abs(tileSize / dir.x) : Infinity;
  const deltaY = dir.y !== 0 ? Math.abs(tileSize / dir.y) : Infinity;

  // дистанция вдоль луча до первой границы клетки по каждой оси
  let maxX =
    dir.x !== 0
      ? (dir.x > 0
          ? (cellX + 1) * tileSize - origin.x
          : origin.x - cellX * tileSize) / Math.abs(dir.x)
      : Infinity;
  let maxY =
    dir.y !== 0
      ? (dir.y > 0
          ? (cellY + 1) * tileSize - origin.y
          : origin.y - cellY * tileSize) / Math.abs(dir.y)
      : Infinity;

  let traveled = 0;

  while (traveled <= range) {
    if (maxX < maxY) {
      traveled = maxX;
      maxX += deltaX;
      cellX += stepX;
    } else {
      traveled = maxY;
      maxY += deltaY;
      cellY += stepY;
    }

    if (traveled > range) {
      return null;
    }

    if (isSolid(cellX, cellY)) {
      return traveled;
    }
  }

  return null;
};

/**
 * Луч против повёрнутого прямоугольника (slab-тест в локальном фрейме OBB).
 * @param {{x: number, y: number}} origin - Начало луча (мировые координаты).
 * @param {{x: number, y: number}} dir - Нормализованное направление.
 * @param {number} range - Максимальная дистанция.
 * @param {Object} box
 * @param {number} box.x - Центр.
 * @param {number} box.y - Центр.
 * @param {number} box.angle - Поворот (радианы).
 * @param {number} box.halfW - Полуширина.
 * @param {number} box.halfH - Полувысота.
 * @returns {number|null} Дистанция до прямоугольника или null (промах).
 */
export const rayVsBox = (origin, dir, range, { x, y, angle, halfW, halfH }) => {
  // перевод луча в локальный фрейм бокса (поворот на −angle)
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const relX = origin.x - x;
  const relY = origin.y - y;

  const localOriginX = cos * relX - sin * relY;
  const localOriginY = sin * relX + cos * relY;
  const localDirX = cos * dir.x - sin * dir.y;
  const localDirY = sin * dir.x + cos * dir.y;

  let tMin = 0;
  let tMax = range;

  // slab-тест по каждой оси AABB [-half, +half]
  const slabs = [
    [localOriginX, localDirX, halfW],
    [localOriginY, localDirY, halfH],
  ];

  for (const [o, d, half] of slabs) {
    if (d === 0) {
      if (o < -half || o > half) {
        return null;
      }

      continue;
    }

    let t1 = (-half - o) / d;
    let t2 = (half - o) / d;

    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    if (tMin > tMax) {
      return null;
    }
  }

  return tMin;
};
