import { describe, it, expect } from 'vitest';
import { rayVsGrid, rayVsBox } from '../../src/lib/raycast.js';

// сетка 5×5, стена (тайл 1) — столбец x=3
const wallColumnMap = [
  [0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0],
  [0, 0, 0, 1, 0],
];

const grid = (map = wallColumnMap, tileSize = 10) => ({
  map,
  solidTiles: [1],
  tileSize,
});

describe('rayVsGrid', () => {
  it('луч вправо утыкается в стену', () => {
    const t = rayVsGrid({ x: 5, y: 25 }, { x: 1, y: 0 }, 100, grid());

    // стена начинается на x=30, старт x=5 → дистанция 25
    expect(t).toBe(25);
  });

  it('луч в противоположную сторону — промах', () => {
    const t = rayVsGrid({ x: 5, y: 25 }, { x: -1, y: 0 }, 100, grid());

    expect(t).toBeNull();
  });

  it('стена дальше range — промах', () => {
    const t = rayVsGrid({ x: 5, y: 25 }, { x: 1, y: 0 }, 20, grid());

    expect(t).toBeNull();
  });

  it('старт внутри стены — попадание в упор (0)', () => {
    const t = rayVsGrid({ x: 35, y: 25 }, { x: 1, y: 0 }, 100, grid());

    expect(t).toBe(0);
  });

  it('диагональный луч пересекает стену на верной дистанции', () => {
    const dir = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const t = rayVsGrid({ x: 5, y: 0 }, dir, 100, grid());

    // стена x=30: дистанция по лучу = 25 / cos(45°) = 25·√2
    expect(t).toBeCloseTo(25 * Math.SQRT2, 6);
  });

  it('вертикальный луч без стен на пути — промах', () => {
    const t = rayVsGrid({ x: 5, y: 5 }, { x: 0, y: 1 }, 100, grid());

    expect(t).toBeNull();
  });

  it('пустая сетка или пустой список стен — промах', () => {
    expect(rayVsGrid({ x: 0, y: 0 }, { x: 1, y: 0 }, 10, grid([]))).toBeNull();
    expect(
      rayVsGrid(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        10,
        { map: wallColumnMap, solidTiles: [], tileSize: 10 },
      ),
    ).toBeNull();
  });
});

describe('rayVsBox', () => {
  const box = { x: 50, y: 0, angle: 0, halfW: 10, halfH: 5 };

  it('луч в лоб — дистанция до ближней грани', () => {
    const t = rayVsBox({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, box);

    expect(t).toBe(40);
  });

  it('луч мимо (по y выше бокса) — промах', () => {
    const t = rayVsBox({ x: 0, y: 10 }, { x: 1, y: 0 }, 100, box);

    expect(t).toBeNull();
  });

  it('бокс дальше range — промах', () => {
    const t = rayVsBox({ x: 0, y: 0 }, { x: 1, y: 0 }, 30, box);

    expect(t).toBeNull();
  });

  it('старт внутри бокса — попадание в упор (0)', () => {
    const t = rayVsBox({ x: 50, y: 0 }, { x: 1, y: 0 }, 100, box);

    expect(t).toBe(0);
  });

  it('поворот бокса учитывается', () => {
    // бокс повёрнут на 90°: полуширина 10 теперь вдоль y, полувысота 5 вдоль x
    const rotated = { x: 50, y: 0, angle: Math.PI / 2, halfW: 10, halfH: 5 };
    const t = rayVsBox({ x: 0, y: 0 }, { x: 1, y: 0 }, 100, rotated);

    expect(t).toBeCloseTo(45, 6);

    // луч со смещением y=8 без поворота промахнулся бы (halfH=5),
    // а по повёрнутому боксу (полуширина 10 вдоль y) попадает
    expect(rayVsBox({ x: 0, y: 8 }, { x: 1, y: 0 }, 100, box)).toBeNull();
    expect(rayVsBox({ x: 0, y: 8 }, { x: 1, y: 0 }, 100, rotated)).not.toBeNull();
  });

  it('луч от бокса в другую сторону — промах', () => {
    const t = rayVsBox({ x: 0, y: 0 }, { x: -1, y: 0 }, 100, box);

    expect(t).toBeNull();
  });
});
