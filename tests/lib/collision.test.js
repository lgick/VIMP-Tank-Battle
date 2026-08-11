import { describe, it, expect } from 'vitest';
import {
  boxCenterFromOrigin,
  obbVsObb,
  collectTileContacts,
} from '../../src/lib/collision.js';

describe('boxCenterFromOrigin: угол объекта → центр', () => {
  it('без поворота — простое смещение на (halfW, halfH)', () => {
    expect(boxCenterFromOrigin(10, 20, 0, 5, 3)).toEqual({ x: 15, y: 23 });
  });

  it('поворот на 90° меняет ориентацию смещения', () => {
    const center = boxCenterFromOrigin(10, 20, Math.PI / 2, 5, 3);

    expect(center.x).toBeCloseTo(7, 6);
    expect(center.y).toBeCloseTo(25, 6);
  });
});

describe('obbVsObb: SAT для двух прямоугольников', () => {
  it('промах: боксы не пересекаются', () => {
    const a = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };
    const b = { x: 20, y: 0, angle: 0, halfW: 5, halfH: 5 };

    expect(obbVsObb(a, b)).toBeNull();
  });

  it('касание вплотную (нулевой overlap) — промах', () => {
    const a = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };
    const b = { x: 10, y: 0, angle: 0, halfW: 5, halfH: 5 };

    expect(obbVsObb(a, b)).toBeNull();
  });

  it('проникновение по оси X: минимальный вектор выталкивания направлен от a к b', () => {
    const a = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };
    const b = { x: 8, y: 0, angle: 0, halfW: 5, halfH: 5 };

    const result = obbVsObb(a, b);

    expect(result).not.toBeNull();
    expect(result.nx).toBeCloseTo(1, 6);
    expect(result.ny).toBeCloseTo(0, 6);
    expect(result.depth).toBeCloseTo(2, 6);
  });

  it('проникновение по оси Y (нормаль направлена от a к b)', () => {
    const a = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };
    const b = { x: 0, y: -8, angle: 0, halfW: 5, halfH: 5 };

    const result = obbVsObb(a, b);

    expect(result.nx).toBeCloseTo(0, 6);
    expect(result.ny).toBeCloseTo(-1, 6);
    expect(result.depth).toBeCloseTo(2, 6);
  });

  it('граневой контакт: точка контакта — середина задетой грани, а не случайный угол', () => {
    const a = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };
    const b = { x: 8, y: 0, angle: 0, halfW: 5, halfH: 5 };

    const result = obbVsObb(a, b);

    // грань a при x=+5 целиком в контакте — середина по Y
    expect(result.cx).toBeCloseTo(5, 6);
    expect(result.cy).toBeCloseTo(0, 6);
  });

  it('угловой контакт: точка контакта — сам угол (даёт плечо для разворота)', () => {
    const a = { x: 0, y: 0, angle: Math.PI / 4, halfW: 5, halfH: 5 };
    const b = { x: 9, y: 0, angle: 0, halfW: 3, halfH: 3 };

    const result = obbVsObb(a, b);

    expect(result).not.toBeNull();

    // повёрнутый на 45° квадрат касается вершиной на расстоянии halfW·√2
    expect(Math.hypot(result.cx, result.cy)).toBeCloseTo(5 * Math.SQRT2, 6);
  });

  it('повёрнутый бокс: возвращённый вектор действительно разделяет боксы', () => {
    // длинная узкая балка (a) и повёрнутая на 45° пластина (b), нависающая сверху
    const a = { x: 0, y: 0, angle: 0, halfW: 10, halfH: 2 };
    const b = { x: 0, y: 5, angle: Math.PI / 4, halfW: 6, halfH: 1 };

    const result = obbVsObb(a, b);

    expect(result).not.toBeNull();

    // применяем выталкивание к b (по направлению нормали, от a к b);
    // небольшой запас страхует от остаточного пересечения на грани
    // float-точности (SAT на самой границе может дать depth ~1e-16)
    const epsilon = 1e-6;
    const separated = {
      ...b,
      x: b.x + result.nx * (result.depth + epsilon),
      y: b.y + result.ny * (result.depth + epsilon),
    };

    expect(obbVsObb(a, separated)).toBeNull();
  });

  // на этом держится ширина контактного пятна: тело с нулевым габаритом
  // дало бы нулевой допуск и 0/0 в точке контакта, но сюда не доходит
  it('вырожденный бокс (нулевой габарит) — промах, а не контакт', () => {
    const degenerate = { x: 0, y: 0, angle: 0, halfW: 0, halfH: 0 };
    const box = { x: 0, y: 0, angle: 0, halfW: 5, halfH: 5 };

    expect(obbVsObb(degenerate, box)).toBeNull();
    expect(obbVsObb(box, degenerate)).toBeNull();
  });
});

describe('collectTileContacts: OBB против тайловой сетки стен', () => {
  const tileSize = 10;

  it('без стен (пустой solidTiles) — контактов нет', () => {
    const grid = { map: [[0, 0], [0, 0]], solidTiles: [], tileSize };
    const obb = { x: 5, y: 5, angle: 0, halfW: 3, halfH: 3 };

    expect(collectTileContacts(obb, grid)).toEqual([]);
  });

  it('без пересечений — контактов нет', () => {
    const grid = { map: [[0, 0], [0, 1]], solidTiles: [1], tileSize };
    // клетка (1,1) — мир [10,20]×[10,20]; бокс далеко от неё
    const obb = { x: 100, y: 100, angle: 0, halfW: 3, halfH: 3 };

    expect(collectTileContacts(obb, grid)).toEqual([]);
  });

  it('грань одной стены: один контакт с нормалью по кратчайшей оси', () => {
    // клетка (1,1) солид — мир [10,20]×[10,20], центр (15,15)
    const grid = { map: [[0, 0], [0, 1]], solidTiles: [1], tileSize };
    // бокс снизу, глубже въехал по Y (overlap 2), чем по X (overlap 6)
    const obb = { x: 15, y: 22, angle: 0, halfW: 3, halfH: 4 };

    const contacts = collectTileContacts(obb, grid);

    expect(contacts).toHaveLength(1);
    // нормаль направлена от obb к клетке, то есть вверх (−Y)
    expect(contacts[0].nx).toBeCloseTo(0, 6);
    expect(contacts[0].ny).toBeCloseTo(-1, 6);
    expect(contacts[0].depth).toBeCloseTo(2, 6);
    expect(contacts[0].tileX).toBe(15);
    expect(contacts[0].tileY).toBe(15);

    // выталкивание против нормали разрешает пересечение
    const resolved = {
      ...obb,
      x: obb.x - contacts[0].nx * contacts[0].depth,
      y: obb.y - contacts[0].ny * contacts[0].depth,
    };
    const tileBox = { x: 15, y: 15, angle: 0, halfW: 5, halfH: 5 };

    expect(obbVsObb(resolved, tileBox)).toBeNull();
  });

  it('внутренний угол: контакт на каждую задетую клетку', () => {
    // L-форма: (0,0),(0,1),(1,0) солид; (1,1) — пустая клетка-«ниша»
    const grid = {
      map: [
        [1, 1],
        [1, 0],
      ],
      solidTiles: [1],
      tileSize,
    };
    // бокс прижат в угол ниши (10,10), пересекает все три стены сразу
    const obb = { x: 12, y: 12, angle: 0, halfW: 4, halfH: 4 };

    const contacts = collectTileContacts(obb, grid);

    expect(contacts).toHaveLength(3);

    // каждый контакт несёт свою клетку и положительную глубину
    const tiles = contacts.map(c => `${c.tileX},${c.tileY}`).sort();

    expect(tiles).toEqual(['15,5', '5,15', '5,5']);
    expect(contacts.every(c => c.depth > 0)).toBe(true);
  });

  it('повёрнутый бокс: кандидатные клетки отбираются по консервативному AABB', () => {
    const grid = { map: [[1, 0], [0, 0]], solidTiles: [1], tileSize };
    // бокс повёрнут на 45°, углом заходит в клетку (0,0) — мир [0,10]×[0,10]
    const obb = { x: 13, y: 13, angle: Math.PI / 4, halfW: 5, halfH: 2 };

    const contacts = collectTileContacts(obb, grid);

    expect(contacts).toHaveLength(1);
    expect(contacts[0].depth).toBeGreaterThan(0);
  });
});
