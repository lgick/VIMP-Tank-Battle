import { Vec2 } from 'planck';
import Pathfinder from './Pathfinder.js';

const COEF_GRIG_STEP = 2.5; // коэффициент шага сетки

/**
 * @class NavigationSystem
 * @description Управляет навигацией: строит граф и ищет пути для ботов.
 */
class NavigationSystem {
  constructor() {
    this._navGraph = null;
    this._pathfinder = new Pathfinder();
    this._navGrid = null; // упрощенная сетка карты для быстрых проверок
    this._gridStep = 0; // размер одной ячейки сетки (тайла)
  }

  /**
   * @description Создает быструю сетку проходимости на основе данных карты.
   * Заполняет `this._navGrid` значениями:
   * 0 - проходимо, 1 - статичное препятствие.
   * @param {object} mapData - Объект с данными карты.
   * @param {number[][]} mapData.map - 2D массив тайлов карты.
   * @param {number[]} mapData.physicsStatic - Массив ID тайлов,
   * являющихся статичными препятствиями.
   * @param {number} mapData.step - Размер одного тайла.
   * @private
   */
  _createNavGrid(mapData) {
    const originalMap = mapData.map;
    const staticObstacles = new Set(mapData.physicsStatic);
    this._navGrid = [];
    this._gridStep = mapData.step;

    for (let y = 0; y < originalMap.length; y += 1) {
      this._navGrid[y] = [];

      for (let x = 0; x < originalMap[y].length; x += 1) {
        const tileId = originalMap[y][x];
        const isObstacle = staticObstacles.has(tileId);
        this._navGrid[y][x] = isObstacle ? 1 : 0;
      }
    }
  }

  /**
   * @description Генерирует навигационный граф на основе данных карты.
   * Процесс включает:
   * 1. Создание сетки проходимости.
   * 2. Расстановку узлов в свободных зонах.
   * 3. Соединение видимых друг для друга узлов рёбрами.
   * @param {object} scaledMapData - Объект с данными масштабированной карты.
   */
  generateNavGraph(scaledMapData) {
    if (!scaledMapData || !scaledMapData.map) {
      this._navGraph = null;
      return;
    }

    // быстрая сетка проходимости
    this._createNavGrid(scaledMapData);

    const nodes = [];
    const nodePlacementStep = this._gridStep * COEF_GRIG_STEP;
    const mapWidth = this._navGrid[0].length * this._gridStep;
    const mapHeight = this._navGrid.length * this._gridStep;

    // расстановка узлов в свободных местах
    for (let x = nodePlacementStep; x < mapWidth; x += nodePlacementStep) {
      for (let y = nodePlacementStep; y < mapHeight; y += nodePlacementStep) {
        const gridX = Math.floor(x / this._gridStep);
        const gridY = Math.floor(y / this._gridStep);

        // если точка находится внутри проходимого тайла
        if (this._navGrid[gridY] && this._navGrid[gridY][gridX] === 0) {
          nodes.push(new Vec2(x, y));
        }
      }
    }

    // соединение узлов рёбрами,
    // с использованием быстрой проверки линии видимости
    const edges = new Map();

    for (let i = 0; i < nodes.length; i += 1) {
      edges.set(i, []);

      for (let j = i + 1; j < nodes.length; j += 1) {
        if (!this._hasObstacleBetween(nodes[i], nodes[j])) {
          const distance = Vec2.distance(nodes[i], nodes[j]);
          edges.get(i).push({ node: j, weight: distance });

          if (!edges.has(j)) {
            edges.set(j, []);
          }

          edges.get(j).push({ node: i, weight: distance });
        }
      }
    }

    this._navGraph = { nodes, edges };

    console.log(
      `Navigation graph generated: ${this._navGraph.nodes.length} nodes.`,
    );
  }

  /**
   * @description Быстрая проверка линии видимости между двумя точками по сетке,
   * используя алгоритм Брезенхэма для растеризации линии.
   * @param {Vec2} start - Вектор начальной точки в мировых координатах.
   * @param {Vec2} end - Вектор конечной точки в мировых координатах.
   * @returns {boolean} - Возвращает `true`,
   * если на пути есть препятствие, иначе `false`.
   * @private
   */
  _hasObstacleBetween(start, end) {
    let x0 = Math.floor(start.x / this._gridStep);
    let y0 = Math.floor(start.y / this._gridStep);
    const x1 = Math.floor(end.x / this._gridStep);
    const y1 = Math.floor(end.y / this._gridStep);

    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;

    while (true) {
      // проверка ячейки на наличие препятствий в сетке
      // если препятствие найдено
      if (this._navGrid[y0]?.[x0] === 1) {
        return true;
      }

      if (x0 === x1 && y0 === y1) {
        break;
      }

      const e2 = 2 * err;

      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }

      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }

    return false; // препятствий на линии нет
  }

  /**
   * @description Находит последовательность точек (путь)
   * от начальной до конечной позиции.
   * Оптимизация: если между точками есть прямая видимость,
   * возвращает путь из одной конечной точки.
   * В противном случае, ищет путь по навигационному графу
   * с помощью алгоритма A*.
   * @param {Vec2} startPos - Вектор начальной позиции.
   * @param {Vec2} endPos - Вектор конечной позиции.
   * @returns {Vec2[] | null} - Массив векторов,
   * представляющих путь, или `null`, если путь не найден.
   */
  findPath(startPos, endPos) {
    if (!this._navGraph || this._navGraph.nodes.length === 0) {
      return null;
    }

    if (!this._hasObstacleBetween(startPos, endPos)) {
      return [endPos];
    }

    const startNode = this._findClosestNode(startPos);
    const endNode = this._findClosestNode(endPos);

    if (startNode === null || endNode === null) {
      return null;
    }

    const pathIndexes = this._pathfinder.findPath(
      startNode,
      endNode,
      this._navGraph,
    );

    if (!pathIndexes) {
      return null;
    }

    const pathCoords = pathIndexes.map(index => this._navGraph.nodes[index]);
    pathCoords.push(endPos);

    return pathCoords;
  }

  /**
   * @description Находит индекс ближайшего узла
   * в навигационном графе (`_navGraph`) к заданной мировой позиции.
   * @param {Vec2} position - Вектор мировой позиции для поиска.
   * @returns {number | null} - Индекс ближайшего узла в `this._navGraph.nodes`
   * или `null`, если граф не существует.
   * @private
   */
  _findClosestNode(position) {
    if (!this._navGraph || this._navGraph.nodes.length === 0) {
      return null;
    }

    let closestNode = null;
    let minDistanceSq = Infinity;

    this._navGraph.nodes.forEach((node, index) => {
      const distanceSq = Vec2.distanceSquared(position, node);

      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestNode = index;
      }
    });

    return closestNode;
  }
}

export default NavigationSystem;
