import { describe, it, expect } from 'vitest';
import {
  boxMassProperties,
  combineSurfaces,
  integrate,
  separateBodies,
  applyContactImpulse,
  MAP_SURFACE,
} from '../../src/lib/rigidBody.js';

// Двухтельный решатель контактов клиентского предсказания. Порядок
// интеграции обязан совпадать с TankPredictor._step — иначе разъезжается
// паритет с сервером (tests/server/TankPredictorParity.test.js).

// разрешение одиночного контакта ровно в том порядке, в каком его делает
// решатель TankPredictor._resolveWorld
const resolveContact = (a, b, contact, params) => {
  separateBodies(a, b, contact);
  applyContactImpulse(a, b, contact, params);
};

const makeBody = (over = {}) => ({
  x: 0,
  y: 0,
  angle: 0,
  vx: 0,
  vy: 0,
  angvel: 0,
  invMass: 1,
  invInertia: 1,
  linearDamping: 0,
  angularDamping: 0,
  ...over,
});

const STATIC = () => makeBody({ invMass: 0, invInertia: 0 });

describe('rigidBody.integrate', () => {
  it('повторяет порядок TankPredictor._step: позиция по недемпфированной скорости', () => {
    const dt = 1 / 120;
    const body = makeBody({
      vx: 100,
      vy: -40,
      angvel: 2,
      linearDamping: 3,
      angularDamping: 100,
    });

    integrate(body, dt);

    // позиция интегрируется скоростью ДО демпфирования
    expect(body.x).toBeCloseTo(100 * dt, 12);
    expect(body.y).toBeCloseTo(-40 * dt, 12);
    expect(body.angle).toBeCloseTo(2 * dt, 12);

    // хранится уже задемпфированная скорость
    expect(body.vx).toBeCloseTo(100 / (1 + dt * 3), 12);
    expect(body.vy).toBeCloseTo(-40 / (1 + dt * 3), 12);
    expect(body.angvel).toBeCloseTo(2 / (1 + dt * 100), 12);
  });

  it('угол нормализуется в [-PI, PI]', () => {
    const body = makeBody({ angle: 3.1, angvel: 10 });

    integrate(body, 0.1);

    expect(body.angle).toBeGreaterThanOrEqual(-Math.PI);
    expect(body.angle).toBeLessThanOrEqual(Math.PI);
  });

  it('нулевое демпфирование скорость не трогает', () => {
    const body = makeBody({ vx: 7, angvel: 3 });

    integrate(body, 0.5);

    expect(body.vx).toBe(7);
    expect(body.angvel).toBe(3);
  });
});

describe('rigidBody.resolveContact: нормальный импульс', () => {
  // лобовой контакт по X: точка контакта на линии центров, плеча нет
  const headOn = () => ({ nx: 1, ny: 0, depth: 2, cx: 5, cy: 0 });

  it('два равных тела: импульс сохраняется', () => {
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const b = makeBody({ x: 8, y: 0, vx: 0 });
    const before = a.vx + b.vx;

    resolveContact(a, b, headOn(), { restitution: 0, friction: 0 });

    expect(a.vx + b.vx).toBeCloseTo(before, 12);
  });

  it('restitution 0 гасит нормальную скорость сближения', () => {
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const b = makeBody({ x: 8, y: 0, vx: 0 });

    resolveContact(a, b, headOn(), { restitution: 0, friction: 0 });

    expect(b.vx - a.vx).toBeCloseTo(0, 12);
  });

  it('restitution 1 разворачивает скорость сближения', () => {
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const b = makeBody({ x: 8, y: 0, vx: 0 });

    resolveContact(a, b, headOn(), { restitution: 1, friction: 0 });

    // упругий удар равных масс — тела обмениваются скоростями
    expect(a.vx).toBeCloseTo(0, 12);
    expect(b.vx).toBeCloseTo(10, 12);
  });

  it('статика (invMass 0) не сдвигается и не разгоняется', () => {
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const wall = STATIC();

    wall.x = 8;

    resolveContact(a, wall, headOn(), {
      restitution: 0,
      friction: 0,
    });

    expect(wall.x).toBe(8);
    expect(wall.vx).toBe(0);
    expect(wall.angvel).toBe(0);

    // всё выталкивание досталось подвижному телу
    expect(a.x).toBeCloseTo(-2, 12);
    expect(a.vx).toBeCloseTo(0, 12);
  });

  it('два статических тела — полный no-op', () => {
    const a = STATIC();
    const b = STATIC();

    b.x = 8;

    resolveContact(a, b, headOn(), { restitution: 0, friction: 0 });

    expect(a).toEqual(STATIC());
  });

  it('расходящиеся тела импульса не получают, но позиция корректируется', () => {
    const a = makeBody({ x: 0, y: 0, vx: -5 });
    const b = makeBody({ x: 8, y: 0, vx: 5 });

    resolveContact(a, b, headOn(), { restitution: 0, friction: 0 });

    expect(a.vx).toBe(-5);
    expect(b.vx).toBe(5);
    // позиционная коррекция делится поровну между равными массами
    expect(a.x).toBeCloseTo(-1, 12);
    expect(b.x).toBeCloseTo(9, 12);
  });

  it('позиционная коррекция делится обратно пропорционально массам', () => {
    const light = makeBody({ x: 0, invMass: 4 });
    const heavy = makeBody({ x: 8, invMass: 1 });

    resolveContact(light, heavy, headOn(), {
      restitution: 0,
      friction: 0,
    });

    // лёгкое тело уезжает вчетверо дальше тяжёлого
    expect(light.x).toBeCloseTo(-1.6, 12);
    expect(heavy.x).toBeCloseTo(8.4, 12);
  });
});

describe('rigidBody.resolveContact: трение и угловой отклик', () => {
  it('трение зажато кулоновским конусом |jt| <= friction * jn', () => {
    // сильное касательное движение при слабом нормальном сближении
    const contact = { nx: 1, ny: 0, depth: 0.1, cx: 5, cy: 0 };
    const a = makeBody({ x: 0, y: 0, vx: 1, vy: 100, invInertia: 0 });
    const b = makeBody({ x: 8, y: 0, invInertia: 0 });

    resolveContact(a, b, contact, { restitution: 0, friction: 0.2 });

    // нормальный импульс равных масс: jn = -vn / (im + im) = 1/2·1 = 0.5
    const jn = 0.5;
    // касательное изменение скорости b по модулю не больше friction·jn·invMass
    expect(Math.abs(b.vy)).toBeLessThanOrEqual(0.2 * jn + 1e-12);
    expect(b.vy).toBeGreaterThan(0);
  });

  it('трение равно нулю — касательная скорость не меняется', () => {
    const contact = { nx: 1, ny: 0, depth: 0.1, cx: 5, cy: 0 };
    const a = makeBody({ x: 0, y: 0, vx: 1, vy: 100, invInertia: 0 });
    const b = makeBody({ x: 8, y: 0, invInertia: 0 });

    resolveContact(a, b, contact, { restitution: 0, friction: 0 });

    expect(b.vy).toBe(0);
    expect(a.vy).toBe(100);
  });

  it('удар в угол (точка контакта вне линии центров) даёт вращение', () => {
    // контакт смещён по Y — появляется плечо
    const contact = { nx: 1, ny: 0, depth: 1, cx: 5, cy: 4 };
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const b = makeBody({ x: 8, y: 0 });

    resolveContact(a, b, contact, { restitution: 0, friction: 0 });

    expect(a.angvel).not.toBe(0);
    expect(b.angvel).not.toBe(0);
  });

  it('лобовой удар по линии центров вращения не даёт', () => {
    const a = makeBody({ x: 0, y: 0, vx: 10 });
    const b = makeBody({ x: 8, y: 0 });

    resolveContact(
      a,
      b,
      { nx: 1, ny: 0, depth: 1, cx: 5, cy: 0 },
      { restitution: 0, friction: 0 },
    );

    expect(a.angvel).toBeCloseTo(0, 12);
    expect(b.angvel).toBeCloseTo(0, 12);
  });
});

describe('rigidBody: разделение развода и импульса', () => {
  const contact = { nx: 1, ny: 0, depth: 2, cx: 5, cy: 0 };

  it('separateBodies трогает только позиции', () => {
    const a = makeBody({ x: 0, vx: 10 });
    const b = makeBody({ x: 8 });

    separateBodies(a, b, contact);

    expect(a.x).toBeCloseTo(-1, 12);
    expect(b.x).toBeCloseTo(9, 12);
    expect(a.vx).toBe(10);
    expect(b.vx).toBe(0);
  });

  it('applyContactImpulse трогает только скорости', () => {
    const a = makeBody({ x: 0, vx: 10 });
    const b = makeBody({ x: 8 });

    applyContactImpulse(a, b, contact, { restitution: 0, friction: 0 });

    expect(a.x).toBe(0);
    expect(b.x).toBe(8);
    expect(a.vx).toBeCloseTo(5, 12);
    expect(b.vx).toBeCloseTo(5, 12);
  });

  // регресс: повтор развода на каждой итерации решателя расталкивал тела
  // кратно числу итераций — отсюда брался рывок рисуемой позиции
  it('итерации импульса не множат позиционную коррекцию', () => {
    const a = makeBody({ x: 0, vx: 10 });
    const b = makeBody({ x: 8 });

    separateBodies(a, b, contact);

    const separated = { ax: a.x, bx: b.x };

    for (let i = 0; i < 4; i += 1) {
      applyContactImpulse(a, b, contact, { restitution: 0, friction: 0 });
    }

    expect(a.x).toBe(separated.ax);
    expect(b.x).toBe(separated.bx);
  });

});

describe('rigidBody: масс-инерционные свойства и поверхности', () => {
  it('масса и момент прямоугольника: m = ρwh, I = m(w²+h²)/12', () => {
    const { invMass, invInertia } = boxMassProperties(8, 6, 200);
    const mass = 200 * 8 * 6;

    expect(1 / invMass).toBeCloseTo(mass, 9);
    expect(1 / invInertia).toBeCloseTo((mass * (64 + 36)) / 12, 6);
  });

  it('нулевая плотность или габарит дают статику, а не деление на ноль', () => {
    expect(boxMassProperties(8, 6, 0)).toEqual({ invMass: 0, invInertia: 0 });
    expect(boxMassProperties(0, 0, 200)).toEqual({ invMass: 0, invInertia: 0 });
  });

  it('поверхности комбинируются правилом среднего (как Rapier)', () => {
    const tank = { friction: 0.5, restitution: 0.1 };

    expect(combineSurfaces(tank, MAP_SURFACE)).toEqual({
      friction: 0.35,
      restitution: 0.05,
    });
  });
});
