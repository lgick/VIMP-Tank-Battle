import { describe, it, expect } from 'vitest';
import SpatialManager from '../../src/server/modules/bots/SpatialManager.js';

const entity = (gameId, x, y, teamId = 1) => ({ gameId, teamId, x, y });

describe('SpatialManager', () => {
  it('queryNearby находит сущность в той же ячейке', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('a', 10, 10));

    const found = sm.queryNearby(20, 20);
    expect(found.map(e => e.gameId)).toEqual(['a']);
  });

  it('queryNearby захватывает 8 соседних ячеек', () => {
    const sm = new SpatialManager(100);
    // центр запроса в ячейке (0,0); соседи в смежных ячейках
    sm.insert(entity('center', 50, 50)); // ячейка 0,0
    sm.insert(entity('right', 150, 50)); // ячейка 1,0 — сосед
    sm.insert(entity('diag', 150, 150)); // ячейка 1,1 — сосед

    const ids = sm.queryNearby(50, 50)
      .map(e => e.gameId)
      .sort();
    expect(ids).toEqual(['center', 'diag', 'right']);
  });

  it('queryNearby не возвращает сущности из дальних ячеек', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('far', 350, 350)); // ячейка 3,3

    const found = sm.queryNearby(50, 50); // ячейки -1..1
    expect(found).toHaveLength(0);
  });

  it('корректно работает с отрицательными координатами (Math.floor)', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('neg', -50, -50)); // ячейка -1,-1

    // запрос из ячейки 0,0 захватывает соседей -1..1, включая -1,-1
    expect(sm.queryNearby(10, 10).map(e => e.gameId)).toEqual(['neg']);
    // запрос далеко не находит
    expect(sm.queryNearby(250, 250)).toHaveLength(0);
  });

  it('несколько сущностей в одной ячейке', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('a', 10, 10));
    sm.insert(entity('b', 20, 20));

    expect(sm.queryNearby(15, 15)).toHaveLength(2);
  });

  it('clear очищает сетку', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('a', 10, 10));
    sm.clear();
    expect(sm.queryNearby(10, 10)).toHaveLength(0);
  });

  it('setCellSize меняет размер и очищает сетку', () => {
    const sm = new SpatialManager(100);
    sm.insert(entity('a', 10, 10));
    sm.setCellSize(500);

    expect(sm.queryNearby(10, 10)).toHaveLength(0); // очищено
    sm.insert(entity('b', 600, 600)); // ячейка 1,1
    expect(sm.queryNearby(550, 550).map(e => e.gameId)).toEqual(['b']);
  });
});
