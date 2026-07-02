import { describe, it, expect } from 'vitest';
import { Vec2, rotateVec } from '../../src/lib/vec2.js';

describe('Vec2: статики', () => {
  it('add/sub возвращают новый вектор, не трогая исходные', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);

    expect(Vec2.add(a, b)).toEqual(new Vec2(4, 6));
    expect(Vec2.sub(a, b)).toEqual(new Vec2(-2, -2));
    expect(a).toEqual(new Vec2(1, 2));
  });

  it('dot и cross', () => {
    const a = new Vec2(1, 2);
    const b = new Vec2(3, 4);

    expect(Vec2.dot(a, b)).toBe(11);
    expect(Vec2.cross(a, b)).toBe(-2); // 1*4 − 2*3
  });

  it('distance и distanceSquared', () => {
    const a = new Vec2(0, 0);
    const b = new Vec2(3, 4);

    expect(Vec2.distance(a, b)).toBe(5);
    expect(Vec2.distanceSquared(a, b)).toBe(25);
  });

  it('clone создаёт независимую копию', () => {
    const a = new Vec2(1, 2);
    const c = Vec2.clone(a);

    c.x = 99;
    expect(a.x).toBe(1);
  });
});

describe('Vec2: мутирующие методы', () => {
  it('add/sub/mul мутируют и возвращают this (чейнинг)', () => {
    const v = new Vec2(1, 2);
    const result = v.add(new Vec2(1, 1)).sub(new Vec2(0, 1)).mul(2);

    expect(result).toBe(v);
    expect(v).toEqual(new Vec2(4, 4));
  });

  it('normalize приводит к единичной длине', () => {
    const v = new Vec2(3, 4).normalize();

    expect(v.length()).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('normalize нулевого вектора не даёт NaN', () => {
    const v = new Vec2(0, 0).normalize();

    expect(v).toEqual(new Vec2(0, 0));
  });

  it('length и lengthSquared', () => {
    const v = new Vec2(3, 4);

    expect(v.length()).toBe(5);
    expect(v.lengthSquared()).toBe(25);
  });

  it('конструктор по умолчанию — ноль', () => {
    expect(new Vec2()).toEqual(new Vec2(0, 0));
  });
});

describe('rotateVec', () => {
  it('поворот на 0 не меняет вектор', () => {
    const r = rotateVec(new Vec2(1, 0), 0);

    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
  });

  it('поворот (1,0) на +π/2 даёт (0,1) — CCW-положительный', () => {
    const r = rotateVec(new Vec2(1, 0), Math.PI / 2);

    expect(r.x).toBeCloseTo(0);
    expect(r.y).toBeCloseTo(1);
  });

  it('поворот на π инвертирует', () => {
    const r = rotateVec(new Vec2(2, 3), Math.PI);

    expect(r.x).toBeCloseTo(-2);
    expect(r.y).toBeCloseTo(-3);
  });

  it('поворот на 2π возвращает исходный', () => {
    const r = rotateVec(new Vec2(2, -1), Math.PI * 2);

    expect(r.x).toBeCloseTo(2);
    expect(r.y).toBeCloseTo(-1);
  });

  it('возвращает новый вектор, исходный не мутирует', () => {
    const v = new Vec2(1, 0);

    rotateVec(v, Math.PI);
    expect(v).toEqual(new Vec2(1, 0));
  });
});
