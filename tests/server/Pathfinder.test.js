import { describe, it, expect } from 'vitest';
import { Vec2 } from 'planck';
import Pathfinder from '../../src/server/modules/bots/Pathfinder.js';

// строим граф из узлов и рёбер.
// edges — двунаправленные, вес = евклидово расстояние
const buildGraph = (nodes, connections) => {
  const edges = new Map();

  const addEdge = (a, b) => {
    if (!edges.has(a)) {
      edges.set(a, []);
    }
    const weight = Vec2.distance(nodes[a], nodes[b]);
    edges.get(a).push({ node: b, weight });
  };

  for (const [a, b] of connections) {
    addEdge(a, b);
    addEdge(b, a);
  }

  return { nodes, edges };
};

describe('Pathfinder (A*)', () => {
  it('находит прямой путь между соседями', () => {
    const nodes = [new Vec2(0, 0), new Vec2(1, 0)];
    const graph = buildGraph(nodes, [[0, 1]]);

    const pf = new Pathfinder();
    expect(pf.findPath(0, 1, graph)).toEqual([0, 1]);
  });

  it('старт совпадает с целью', () => {
    const nodes = [new Vec2(0, 0)];
    const graph = buildGraph(nodes, []);

    const pf = new Pathfinder();
    expect(pf.findPath(0, 0, graph)).toEqual([0]);
  });

  it('выбирает кратчайший из двух путей (регрессия на цикл в cameFrom)', () => {
    // нижний путь 0-2-3 короче верхнего 0-1-3 (узел 1 далеко вверху).
    // этот граф раньше вызывал бесконечный цикл из-за `|| Infinity`
    const nodes = [
      new Vec2(0, 0), // 0
      new Vec2(1, 5), // 1 — далеко вверх
      new Vec2(1, 0), // 2 — прямо
      new Vec2(2, 0), // 3
    ];
    const graph = buildGraph(nodes, [
      [0, 1],
      [1, 3],
      [0, 2],
      [2, 3],
    ]);

    const pf = new Pathfinder();
    expect(pf.findPath(0, 3, graph)).toEqual([0, 2, 3]);
  });

  it('возвращает null, если путь не существует', () => {
    const nodes = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(5, 5)];
    // узел 2 изолирован
    const graph = buildGraph(nodes, [[0, 1]]);

    const pf = new Pathfinder();
    expect(pf.findPath(0, 2, graph)).toBeNull();
  });

  it('находит путь через цепочку узлов', () => {
    const nodes = [
      new Vec2(0, 0),
      new Vec2(1, 0),
      new Vec2(2, 0),
      new Vec2(3, 0),
    ];
    const graph = buildGraph(nodes, [
      [0, 1],
      [1, 2],
      [2, 3],
    ]);

    const pf = new Pathfinder();
    expect(pf.findPath(0, 3, graph)).toEqual([0, 1, 2, 3]);
  });
});
