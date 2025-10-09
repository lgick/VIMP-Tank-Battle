import { Vec2 } from 'planck';
import Pathfinder from './Pathfinder.js';

// коэффициент шага сетки
const COEF_GRIG_STEP = 2.0;

/**
 * @class NavigationSystem
 * @description Управляет навигацией: строит граф и ищет пути для ботов.
 */
class NavigationSystem {
  /**
   * @description Создает экземпляр NavigationSystem.
   */
  constructor() {
    this._navGraph = null;
    this._pathfinder = new Pathfinder();
    this._navGrid = null; // упрощенная сетка карты для быстрых проверок
    this._gridStep = 0; // размер одной ячейки сетки (тайла)

    // сетка для быстрого поиска узлов
    // (хранит индексы узлов графа для быстрого поиска ближайших)
    this._nodeGrid = null;

    // размер ячейки сетки для узлов
    this._nodeGridCellSize = 0;
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
   * 3. Соединение видимых друг для друга *ближайших* узлов рёбрами.
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
    for (let x = nodePlacementStep / 2; x < mapWidth; x += nodePlacementStep) {
      for (
        let y = nodePlacementStep / 2;
        y < mapHeight;
        y += nodePlacementStep
      ) {
        if (this.isWalkable(new Vec2(x, y))) {
          nodes.push(new Vec2(x, y));
        }
      }
    }

    // соединение узлов рёбрами,
    // с использованием быстрой проверки линии видимости
    const edges = new Map();
    const maxConnectionDistSq =
      nodePlacementStep * 1.5 * (nodePlacementStep * 1.5);

    for (let i = 0; i < nodes.length; i += 1) {
      edges.set(i, []);

      for (let j = i + 1; j < nodes.length; j += 1) {
        const distSq = Vec2.distanceSquared(nodes[i], nodes[j]);

        // проверка ближайших соседей, чтобы избежать N^2 перебора
        if (distSq <= maxConnectionDistSq) {
          if (!this._hasObstacleBetween(nodes[i], nodes[j])) {
            const distance = Math.sqrt(distSq);
            edges.get(i).push({ node: j, weight: distance });

            if (!edges.has(j)) {
              edges.set(j, []);
            }

            edges.get(j).push({ node: i, weight: distance });
          }
        }
      }
    }

    this._navGraph = { nodes, edges };
    this._createNodeGrid(this._navGraph.nodes, nodePlacementStep);

    console.log(
      `Optimized navigation graph generated: ${this._navGraph.nodes.length} nodes.`,
    );
  }

  /**
   * @description Создаёт и заполняет сетку
   * для быстрого пространственного поиска узлов графа.
   * @param {Vec2[]} nodes - Массив всех узлов навигационного графа.
   * @param {number} cellSize - Размер ячейки сетки.
   * @private
   */
  _createNodeGrid(nodes, cellSize) {
    this._nodeGrid = new Map();
    this._nodeGridCellSize = cellSize;

    nodes.forEach((node, index) => {
      const cx = Math.floor(node.x / this._nodeGridCellSize);
      const cy = Math.floor(node.y / this._nodeGridCellSize);
      const key = `${cx},${cy}`;

      if (!this._nodeGrid.has(key)) {
        this._nodeGrid.set(key, []);
      }

      this._nodeGrid.get(key).push(index);
    });
  }

  /**
   * @description Возвращает координаты случайного узла из навигационного графа.
   * @returns {Vec2 | null} Координаты случайной точки или null,
   * если граф не готов.
   */
  getRandomNode() {
    if (!this._navGraph || this._navGraph.nodes.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * this._navGraph.nodes.length);

    return this._navGraph.nodes[randomIndex];
  }

  /**
   * @description Проверяет, является ли точка на карте проходимой.
   * @param {Vec2} point - Вектор с мировыми координатами точки.
   * @returns {boolean} - true, если точка проходима, иначе false.
   */
  isWalkable(point) {
    if (!this._navGrid || this._gridStep === 0) {
      return false;
    }

    const gridX = Math.floor(point.x / this._gridStep);
    const gridY = Math.floor(point.y / this._gridStep);

    return this._navGrid[gridY]?.[gridX] === 0;
  }

  /**
   * @description Быстрая проверка линии видимости между двумя точками по сетке.
   * @param {Vec2} start - Вектор начальной точки в мировых координатах.
   * @param {Vec2} end - Вектор конечной точки в мировых координатах.
   * @returns {boolean} - Возвращает `true`, если на пути
   * есть препятствие, иначе `false`.
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

    return false;
  }

  /**
   * @description Находит последовательность точек (путь)
   * от начальной до конечной позиции.
   * @param {Vec2} startPos - Вектор начальной позиции.
   * @param {Vec2} endPos - Вектор конечной позиции.
   * @returns {Vec2[] | null} - Массив векторов, представляющих путь, или `null`.
   */
  findPath(startPos, endPos) {
    if (!this._navGraph || this._navGraph.nodes.length === 0) {
      return null;
    }

    if (!this._hasObstacleBetween(startPos, endPos)) {
      return [endPos];
    }

    const startNode = this._findClosestVisibleNode(startPos);
    const endNode = this._findClosestVisibleNode(endPos);

    if (startNode === null || endNode === null || startNode === endNode) {
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
   * @description Находит индекс ближайшего *видимого* узла
   * к заданной мировой позиции.
   * @param {Vec2} position - Вектор мировой позиции для поиска.
   * @returns {number | null} - Индекс ближайшего узла или `null`.
   * @private
   */
  _findClosestVisibleNode(position) {
    if (!this._navGraph || !this._nodeGrid) {
      return null;
    }

    const centerCx = Math.floor(position.x / this._nodeGridCellSize);
    const centerCy = Math.floor(position.y / this._nodeGridCellSize);
    const candidateIndexes = [];

    // сбор кандидатов из 9 соседних ячеек (включая центральную)
    for (let cy = centerCy - 1; cy <= centerCy + 1; cy += 1) {
      for (let cx = centerCx - 1; cx <= centerCx + 1; cx += 1) {
        const key = `${cx},${cy}`;
        const cellNodeIndexes = this._nodeGrid.get(key);

        if (cellNodeIndexes) {
          candidateIndexes.push(...cellNodeIndexes);
        }
      }
    }

    if (candidateIndexes.length === 0) {
      return null;
    }

    let closestNode = null;
    let minDistanceSq = Infinity;

    // поиск ближайшего видимого узела только среди кандидатов
    for (const index of candidateIndexes) {
      const node = this._navGraph.nodes[index];

      if (!this._hasObstacleBetween(position, node)) {
        const distanceSq = Vec2.distanceSquared(position, node);

        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          closestNode = index;
        }
      }
    }

    return closestNode;
  }
}

export default NavigationSystem;
