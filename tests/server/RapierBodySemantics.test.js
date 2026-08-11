import { describe, it, expect } from 'vitest';
import RAPIER from '../../src/server/physics/rapier.js';
import { boxCenterFromOrigin } from '../../src/lib/collision.js';

// Пробный тест семантики Rapier для динамики карты (см. plan 4.6).
// Тело создаётся как в Map.createDynamic: коллайдер смещён на полразмера,
// поэтому body.translation() — это УГОЛ объекта, а не центр. Клиентская
// реплика (MapDynamics) кладёт linvel() прямо в скорость ЦЕНТРА бокса —
// тест фиксирует, что это верно и при вращении. Ошибка здесь тихая:
// выглядит как «ящик немного дрожит».

const TIME_STEP = 1 / 60;
const HALF_W = 10;
const HALF_H = 6;

// тело с коллайдером, смещённым на полразмера (как динамика карты)
const makeBody = (world, { x, y, angle, vx, vy, angvel }) => {
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setRotation(angle)
      .setLinvel(vx, vy)
      .setAngvel(angvel)
      .setLinearDamping(0)
      .setAngularDamping(0)
      .setCanSleep(false),
  );

  world.createCollider(
    RAPIER.ColliderDesc.cuboid(HALF_W, HALF_H)
      .setTranslation(HALF_W, HALF_H)
      .setDensity(20),
    body,
  );

  return body;
};

// центр коллайдера, восстановленный из позиции тела (угол объекта)
const centerOf = body => {
  const pos = body.translation();

  return boxCenterFromOrigin(pos.x, pos.y, body.rotation(), HALF_W, HALF_H);
};

const makeWorld = () => {
  const world = new RAPIER.World({ x: 0, y: 0 });

  world.timestep = TIME_STEP;

  return world;
};

describe('Rapier: семантика linvel() у тела со смещённым коллайдером', () => {
  it('linvel() — скорость ЦЕНТРА бокса, не угла объекта (вращение включено)', () => {
    const world = makeWorld();
    const body = makeBody(world, {
      x: 100,
      y: 50,
      angle: 0.3,
      vx: 40,
      vy: -25,
      angvel: 1.5,
    });

    const before = centerOf(body);
    const linvel = body.linvel();

    world.step();

    const after = centerOf(body);

    // смещение центра за шаг совпадает с linvel * dt
    expect(after.x - before.x).toBeCloseTo(linvel.x * TIME_STEP, 3);
    expect(after.y - before.y).toBeCloseTo(linvel.y * TIME_STEP, 3);
  });

  it('угол объекта за тот же шаг смещается ИНАЧЕ (вклад вращения плеча)', () => {
    const world = makeWorld();
    const body = makeBody(world, {
      x: 100,
      y: 50,
      angle: 0,
      vx: 0,
      vy: 0,
      angvel: 2,
    });

    const originBefore = body.translation();
    const originBeforeX = originBefore.x;
    const originBeforeY = originBefore.y;

    world.step();

    const originAfter = body.translation();

    // при нулевой linvel центр стоит на месте, а угол объекта — нет
    expect(
      Math.hypot(originAfter.x - originBeforeX, originAfter.y - originBeforeY),
    ).toBeGreaterThan(0.1);
  });

  it('angvel() интегрируется в rotation() напрямую', () => {
    const world = makeWorld();
    const body = makeBody(world, {
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
      angvel: 1.2,
    });

    const before = body.rotation();

    world.step();

    expect(body.rotation() - before).toBeCloseTo(1.2 * TIME_STEP, 4);
  });
});
