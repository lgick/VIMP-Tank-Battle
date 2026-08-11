// 2D-примитивы столкновений: угол объекта → центр, OBB против OBB (SAT),
// OBB против тайловой сетки стен. Общий слой для клиентского предсказания
// своего танка (TankPredictor) и raycast-предсказания выстрелов
// (ShotPredictor через MapDynamics) — оба должны видеть геометрию карты
// одинаково. Чистые функции без зависимостей от Pixi/Rapier.

import { rotateVec } from './vec2.js';

// Ширина контактного пятна как доля габарита тела. Одиночная опорная вершина
// при почти плоском контакте даёт автоколебание: импульс перекидывает корпус
// через положение «заподлицо», опорным становится противоположный угол грани,
// и так каждый шаг. Поэтому вершины грани смешиваются с непрерывным весом:
// при контакте заподлицо точка контакта — середина грани (плеча нет, тело
// успокаивается), при явно косом ударе вес второй вершины падает до нуля и
// остаётся честный угловой контакт с полным плечом разворота.
const CONTACT_MANIFOLD_RATIO = 0.15;

/**
 * Переводит «угол объекта» (позиция тела Rapier для динамики карты —
 * см. src/server/parts/Map.js) в центр бокса: коллайдер сервера смещён
 * от тела на (halfW, halfH) в локальном (повёрнутом) фрейме объекта.
 * @param {number} x - Угол объекта (мировая X).
 * @param {number} y - Угол объекта (мировая Y).
 * @param {number} angle - Поворот (радианы).
 * @param {number} halfW - Полуширина.
 * @param {number} halfH - Полувысота.
 * @returns {{x: number, y: number}} Центр бокса (мировые координаты).
 */
export const boxCenterFromOrigin = (x, y, angle, halfW, halfH) => {
  const offset = rotateVec({ x: halfW, y: halfH }, angle);

  return { x: x + offset.x, y: y + offset.y };
};

// мировые углы OBB (порядок не важен — используются только для проекции)
const obbCorners = ({ x, y, angle, halfW, halfH }) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [];

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const lx = sx * halfW;
      const ly = sy * halfH;

      corners.push({
        x: x + cos * lx - sin * ly,
        y: y + sin * lx + cos * ly,
      });
    }
  }

  return corners;
};

// точка контакта: вершины a вдоль нормали, смешанные по близости к самой
// глубокой (см. CONTACT_MANIFOLD_RATIO)
const contactPoint = (corners, nx, ny, tolerance) => {
  let best = -Infinity;

  for (const p of corners) {
    best = Math.max(best, p.x * nx + p.y * ny);
  }

  let sumX = 0;
  let sumY = 0;
  let sumWeight = 0;

  for (const p of corners) {
    const weight = 1 - (best - (p.x * nx + p.y * ny)) / tolerance;

    if (weight > 0) {
      sumX += p.x * weight;
      sumY += p.y * weight;
      sumWeight += weight;
    }
  }

  return { x: sumX / sumWeight, y: sumY / sumWeight };
};

/**
 * SAT-тест двух повёрнутых прямоугольников (OBB).
 * @param {{x,y,angle,halfW,halfH}} a
 * @param {{x,y,angle,halfW,halfH}} b
 * @returns {{nx: number, ny: number, depth: number, cx: number, cy: number}|null}
 *   Минимальный вектор выталкивания (нормаль направлена от центра a к центру b),
 *   глубина проникновения и мировая точка контакта; null — нет пересечения.
 */
export const obbVsObb = (a, b) => {
  const axes = [
    [Math.cos(a.angle), Math.sin(a.angle)],
    [-Math.sin(a.angle), Math.cos(a.angle)],
    [Math.cos(b.angle), Math.sin(b.angle)],
    [-Math.sin(b.angle), Math.cos(b.angle)],
  ];

  const cornersA = obbCorners(a);
  const cornersB = obbCorners(b);

  let minOverlap = Infinity;
  let normalX = 0;
  let normalY = 0;

  for (const [ax, ay] of axes) {
    let minA = Infinity;
    let maxA = -Infinity;
    let minB = Infinity;
    let maxB = -Infinity;

    for (const p of cornersA) {
      const proj = p.x * ax + p.y * ay;

      minA = Math.min(minA, proj);
      maxA = Math.max(maxA, proj);
    }

    for (const p of cornersB) {
      const proj = p.x * ax + p.y * ay;

      minB = Math.min(minB, proj);
      maxB = Math.max(maxB, proj);
    }

    const overlap = Math.min(maxA, maxB) - Math.max(minA, minB);

    if (overlap <= 0) {
      return null;
    }

    if (overlap < minOverlap) {
      minOverlap = overlap;

      // нормаль ориентируется от центра a к центру b
      const cx = b.x - a.x;
      const cy = b.y - a.y;
      const sign = cx * ax + cy * ay < 0 ? -1 : 1;

      normalX = ax * sign;
      normalY = ay * sign;
    }
  }

  const contact = contactPoint(
    cornersA,
    normalX,
    normalY,
    CONTACT_MANIFOLD_RATIO * (a.halfW + a.halfH),
  );

  return {
    nx: normalX,
    ny: normalY,
    depth: minOverlap,
    cx: contact.x,
    cy: contact.y,
  };
};

/**
 * Суммарное выталкивание OBB из сплошных клеток тайловой сетки.
 * Несколько итераций нужны, чтобы корректно отработать внутренний угол
 * (два соседних тайла), где один проход даёт только частичное разрешение.
 * @param {{x,y,angle,halfW,halfH}} obb
 * @param {Object} grid
 * @param {Array<Array>} grid.map - Двумерный массив тайлов.
 * @param {Array} grid.solidTiles - Значения тайлов, являющихся стеной.
 * @param {number} grid.tileSize - Размер тайла в мировых единицах.
 * @param {number} [iterations=3]
 * @returns {{x: number, y: number, cx: number, cy: number, hit: boolean}}
 *   Суммарный вектор выталкивания и точка контакта (средневзвешенная по
 *   глубине проникновения, если клеток задето несколько).
 */
export const obbVsTileGrid = (obb, { map, solidTiles, tileSize }, iterations = 3) => {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;

  if (rows === 0 || cols === 0 || solidTiles.length === 0) {
    return { x: 0, y: 0, cx: 0, cy: 0, hit: false };
  }

  let totalX = 0;
  let totalY = 0;
  let contactX = 0;
  let contactY = 0;
  let contactWeight = 0;
  const current = {
    x: obb.x,
    y: obb.y,
    angle: obb.angle,
    halfW: obb.halfW,
    halfH: obb.halfH,
  };

  for (let iter = 0; iter < iterations; iter += 1) {
    // консервативный AABB текущего OBB (для отбора кандидатных клеток)
    const cos = Math.abs(Math.cos(current.angle));
    const sin = Math.abs(Math.sin(current.angle));
    const extentX = current.halfW * cos + current.halfH * sin;
    const extentY = current.halfW * sin + current.halfH * cos;

    const minCellX = Math.max(0, Math.floor((current.x - extentX) / tileSize));
    const maxCellX = Math.min(
      cols - 1,
      Math.floor((current.x + extentX) / tileSize),
    );
    const minCellY = Math.max(0, Math.floor((current.y - extentY) / tileSize));
    const maxCellY = Math.min(
      rows - 1,
      Math.floor((current.y + extentY) / tileSize),
    );

    let pushX = 0;
    let pushY = 0;
    let hit = false;

    for (let cy = minCellY; cy <= maxCellY; cy += 1) {
      for (let cx = minCellX; cx <= maxCellX; cx += 1) {
        if (solidTiles.indexOf(map[cy][cx]) === -1) {
          continue;
        }

        const tileBox = {
          x: cx * tileSize + tileSize / 2,
          y: cy * tileSize + tileSize / 2,
          angle: 0,
          halfW: tileSize / 2,
          halfH: tileSize / 2,
        };

        const result = obbVsObb(current, tileBox);

        if (result) {
          hit = true;
          // нормаль result направлена от obb к клетке — выталкиваем obb против неё
          pushX -= result.nx * result.depth;
          pushY -= result.ny * result.depth;

          contactX += result.cx * result.depth;
          contactY += result.cy * result.depth;
          contactWeight += result.depth;
        }
      }
    }

    if (!hit) {
      break;
    }

    current.x += pushX;
    current.y += pushY;
    totalX += pushX;
    totalY += pushY;
  }

  if (contactWeight === 0) {
    return { x: totalX, y: totalY, cx: 0, cy: 0, hit: false };
  }

  return {
    x: totalX,
    y: totalY,
    cx: contactX / contactWeight,
    cy: contactY / contactWeight,
    hit: true,
  };
};
