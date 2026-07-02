import { describe, it, expect } from 'vitest';
import { Vec2 } from '../../src/lib/vec2.js';
import NavigationSystem from '../../src/server/modules/bots/NavigationSystem.js';

// строит mapData нужного размера.
// rows — 2D массив тайлов (0 — пол, 1 — стена), step — размер тайла
const mapData = (rows, step = 10) => ({
  map: rows,
  physicsStatic: [1],
  step,
});

// полностью открытая карта size×size
const openMap = (size, step = 10) =>
  mapData(
    Array.from({ length: size }, () => Array.from({ length: size }, () => 0)),
    step,
  );

describe('NavigationSystem.isWalkable', () => {
  it('false до генерации сетки', () => {
    const nav = new NavigationSystem();
    expect(nav.isWalkable(new Vec2(5, 5))).toBe(false);
  });

  it('true на свободном тайле, false на препятствии', () => {
    const nav = new NavigationSystem();
    // ряд 1 содержит стену в столбце 2
    nav.generateNavGraph(
      mapData([
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    );

    expect(nav.isWalkable(new Vec2(5, 5))).toBe(true); // тайл (0,0)
    expect(nav.isWalkable(new Vec2(25, 15))).toBe(false); // тайл (2,1) — стена
  });

  it('false за пределами карты', () => {
    const nav = new NavigationSystem();
    nav.generateNavGraph(openMap(3));

    expect(nav.isWalkable(new Vec2(-5, 5))).toBe(false);
    expect(nav.isWalkable(new Vec2(1000, 5))).toBe(false);
  });
});

describe('NavigationSystem.generateNavGraph', () => {
  it('null при пустых данных карты', () => {
    const nav = new NavigationSystem();
    nav.generateNavGraph(null);
    expect(nav.getRandomNode()).toBeNull();
  });

  it('создаёт узлы и рёбра на открытой карте', () => {
    const nav = new NavigationSystem();
    nav.generateNavGraph(openMap(8));

    const node = nav.getRandomNode();
    expect(node).not.toBeNull();
    expect(typeof node.x).toBe('number');
    expect(typeof node.y).toBe('number');
  });
});

describe('NavigationSystem.findPath', () => {
  it('прямая видимость возвращает конечную точку напрямую', () => {
    const nav = new NavigationSystem();
    nav.generateNavGraph(openMap(8));

    const start = new Vec2(5, 5);
    const end = new Vec2(55, 5); // вдоль свободного ряда
    const path = nav.findPath(start, end);

    expect(path).toEqual([end]);
  });

  it('null, если граф не сгенерирован', () => {
    const nav = new NavigationSystem();
    expect(nav.findPath(new Vec2(0, 0), new Vec2(50, 50))).toBeNull();
  });

  it('при перекрытой видимости завершается (регрессия на цикл A*)', () => {
    const nav = new NavigationSystem();
    // вертикальная стена в столбце 4 разбивает карту на две зоны
    nav.generateNavGraph(
      mapData([
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
        [0, 0, 0, 0, 1, 0, 0, 0, 0],
      ]),
    );

    const path = nav.findPath(new Vec2(5, 25), new Vec2(85, 25));
    // путь напрямую перекрыт стеной; алгоритм должен завершиться,
    // вернув либо массив точек, либо null — но не зависнуть
    expect(path === null || Array.isArray(path)).toBe(true);
  });
});

describe('NavigationSystem: линия видимости (_hasObstacleBetween)', () => {
  it('видит препятствие на пути и его отсутствие', () => {
    const nav = new NavigationSystem();
    nav.generateNavGraph(
      mapData([
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
      ]),
    );

    // через ряд 1 (со стеной в столбце 2)
    expect(nav._hasObstacleBetween(new Vec2(5, 15), new Vec2(45, 15))).toBe(
      true,
    );
    // через ряд 0 (свободный)
    expect(nav._hasObstacleBetween(new Vec2(5, 5), new Vec2(45, 5))).toBe(
      false,
    );
  });
});
