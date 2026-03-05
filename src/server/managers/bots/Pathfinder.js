import { Vec2 } from 'planck';

/**
 * @class Pathfinder
 * @description Реализует алгоритм поиска пути A* ("A-star").
 */
class Pathfinder {
  /**
   * Находит кратчайший путь между двумя узлами в графе.
   * @param {number} startNode - Индекс стартового узла.
   * @param {number} endNode - Индекс конечного узла.
   * @param {object} graph - Граф в формате { nodes: Vec2[],
   * edges: Map<number, {node: number, weight: number}[]> }.
   * @returns {number[] | null} - Массив индексов узлов пути или null.
   */
  findPath(startNode, endNode, graph) {
    // узлы, которые нужно проверить
    const openSet = [startNode];
    // для каждого узла - предыдущий узел в пути
    const cameFrom = new Map();

    // стоимость пути от начала до текущего узла
    const gScore = new Map();
    gScore.set(startNode, 0);

    // fScore: gScore + эвристика (предполагаемая стоимость до конца)
    const fScore = new Map();

    fScore.set(
      startNode,
      this._heuristic(graph.nodes[startNode], graph.nodes[endNode]),
    );

    while (openSet.length > 0) {
      // узел в openSet с наименьшим fScore
      let current = openSet[0];

      for (let i = 1; i < openSet.length; i += 1) {
        if (fScore.get(openSet[i]) < fScore.get(current)) {
          current = openSet[i];
        }
      }

      // если цель достигнута, восстанавить и возвратить путь
      if (current === endNode) {
        return this._reconstructPath(cameFrom, current);
      }

      // удаление текущего узела из openSet
      openSet.splice(openSet.indexOf(current), 1);

      // проверка соседей
      const neighbors = graph.edges.get(current) || [];

      for (const edge of neighbors) {
        const neighbor = edge.node;
        const tentative = gScore.get(current) + edge.weight;

        if (tentative < (gScore.get(neighbor) || Infinity)) {
          // лучший путь к этому соседу
          cameFrom.set(neighbor, current);
          gScore.set(neighbor, tentative);
          fScore.set(
            neighbor,
            tentative +
              this._heuristic(graph.nodes[neighbor], graph.nodes[endNode]),
          );

          if (!openSet.includes(neighbor)) {
            openSet.push(neighbor);
          }
        }
      }
    }

    // путь не найден
    return null;
  }

  _heuristic(nodeA, nodeB) {
    // эвристика - простое евклидово расстояние
    return Vec2.distance(nodeA, nodeB);
  }

  _reconstructPath(cameFrom, current) {
    const totalPath = [current];

    while (cameFrom.has(current)) {
      current = cameFrom.get(current);
      totalPath.unshift(current);
    }

    return totalPath;
  }
}

export default Pathfinder;
