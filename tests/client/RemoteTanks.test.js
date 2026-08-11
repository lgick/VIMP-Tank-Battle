import { describe, it, expect, beforeEach } from 'vitest';
import RemoteTanks from '../../src/client/RemoteTanks.js';

// одна модель m1: size 10 → width 40, height 30 (соотношение 4:3, как Tank)
const models = {
  m1: { fixture: { density: 1, friction: 0.5, restitution: 0.1 } },
};

// танк живой (condition 3), size 10, teamId 1, angvel 0
const tankData = (x, y, angle = 0, vx = 0, vy = 0, angvel = 0) => [
  x, y, angle, 0, vx, vy, 0, 3, 10, 1, angvel,
];

// OBB своего танка (центр), которым проверяется захват
const tankObb = (x, y) => ({ x, y, angle: 0, halfW: 4, halfH: 3 });

const bodyOf = (rt, modelKey, gameId) => rt._bodies[`${modelKey}:${gameId}`];

describe('RemoteTanks: update', () => {
  let rt;

  beforeEach(() => {
    rt = new RemoteTanks(models);
  });

  it('заводит новое тело в режиме follow', () => {
    rt.update({ m1: { 7: tankData(100, 50, 0.5) } });

    const body = bodyOf(rt, 'm1', '7');

    expect(body.mode).toBe('follow');
    expect(body.x).toBeCloseTo(100, 6);
    expect(body.y).toBeCloseTo(50, 6);
    expect(body.angle).toBeCloseTo(0.5, 6);
  });

  it('габариты и масса считаются из size (4:3, как Tank)', () => {
    rt.update({ m1: { 7: tankData(0, 0) } });

    const body = bodyOf(rt, 'm1', '7');
    const mass = 1 * 40 * 30;
    const inertia = (mass * (40 * 40 + 30 * 30)) / 12;

    expect(body.halfW).toBeCloseTo(20, 6);
    expect(body.halfH).toBeCloseTo(15, 6);
    expect(1 / body.invMass).toBeCloseTo(mass, 6);
    expect(1 / body.invInertia).toBeCloseTo(inertia, 3);
  });

  it('follow-тело следует за кадром напрямую', () => {
    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.update({ m1: { 7: tankData(30, 40, 1) } });

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(30, 6);
    expect(body.y).toBeCloseTo(40, 6);
    expect(body.angle).toBeCloseTo(1, 6);
  });

  it('null-запись удаляет тело', () => {
    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.update({ m1: { 7: null } });

    expect(bodyOf(rt, 'm1', '7')).toBeUndefined();
  });

  it('свой gameId исключается', () => {
    rt.setOwnGameId(7);
    rt.update({ m1: { 7: tankData(0, 0) } });

    expect(bodyOf(rt, 'm1', '7')).toBeUndefined();
  });

  it('неизвестный блок снапшота (не модель) игнорируется', () => {
    rt.update({ w1: [] });

    expect(rt.getRenderData()).toBeNull();
  });

  it('предсказанное тело не переписывается кадром: обновляется только follow', () => {
    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.capture(tankObb(0, 0), 1000);
    rt.update({ m1: { 7: tankData(999, 999) } });

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(0, 6); // не улетел на 999
    expect(body.follow).toEqual({ x: 999, y: 999, angle: 0 });
  });
});

describe('RemoteTanks: захват в предсказание', () => {
  let rt;

  beforeEach(() => {
    rt = new RemoteTanks(models);
    rt.update({ m1: { 7: tankData(0, 0) } }); // halfW 20, halfH 15
  });

  it('follow → predicted при пересечении раздутым OBB своего танка', () => {
    rt.capture(tankObb(-15, 0), 1000);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('predicted');
    expect(rt.getPredictedBodies()).toHaveLength(1);
  });

  it('далёкое тело остаётся в follow', () => {
    rt.capture(tankObb(500, 500), 1000);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('follow');
    expect(rt.getPredictedBodies()).toEqual([]);
  });

  it('захват работает по авторитетной позиции с упреждением, а не по follow', () => {
    // авторитетно танк едет прямо на нас и через CAPTURE_LOOKAHEAD (0.2с)
    // окажется в контакте, хотя ни follow, ни текущее положение не касаются
    rt.beginReconcile({ m1: { 7: tankData(-100, 0, 0, 500, 0) } });

    rt.capture(tankObb(-15, 0), 1000);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('predicted');
  });

  it('нет транзитивного замыкания: сосед предсказанного не захватывается', () => {
    rt.update({ m1: { 7: tankData(0, 0), 8: tankData(41, 0) } });

    // раздутый OBB своего танка касается только 7-го
    rt.capture(tankObb(-15, 0), 1000);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('predicted');
    expect(bodyOf(rt, 'm1', '8').mode).toBe('follow');
  });

  it('уничтоженный танк (condition 0) не захватывается', () => {
    rt.update({
      m1: { 7: [0, 0, 0, 0, 0, 0, 0, 0, 10, 1, 0] }, // condition 0
    });

    rt.capture(tankObb(-15, 0), 1000);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('follow');
  });

  it('потолок MAX_PREDICTED_TANKS ограничивает множество', () => {
    const many = {};

    for (let i = 0; i < 10; i += 1) {
      many[i] = tankData(i * 41, 0);
    }

    rt.update({ m1: many });

    rt.capture({ x: 200, y: 0, angle: 0, halfW: 250, halfH: 250 }, 1000);

    expect(rt.getPredictedBodies()).toHaveLength(6);
  });

  it('промотирует seed из follow, если авторитетного кадра ещё не было', () => {
    rt.capture(tankObb(-15, 0), 1000);

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(0, 6);
    expect(body.vx).toBe(0);
  });

  it('промотирует seed из авторитетного кадра, когда он уже приходил', () => {
    rt.beginReconcile({ m1: { 7: tankData(5, 5, 0, 10, -2, 0.3) } });
    rt.capture(tankObb(-15, 5), 1000);

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(5, 6);
    expect(body.vx).toBe(10);
    expect(body.angvel).toBeCloseTo(0.3, 6);
  });
});

describe('RemoteTanks: реконсиляция', () => {
  let rt;

  beforeEach(() => {
    rt = new RemoteTanks(models);
    rt.update({ m1: { 7: tankData(0, 0) } });
  });

  it('beginReconcile подменяет состояние предсказанного тела авторитетным', () => {
    rt.capture(tankObb(-15, 0), 1000);
    rt.beginReconcile({ m1: { 7: tankData(200, 0, 0, 40, -5, 1.5) } });

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(200, 6);
    expect(body.vx).toBe(40);
    expect(body.angvel).toBeCloseTo(1.5, 6);
  });

  it('follow-тело не подменяется, но lastServer запоминается', () => {
    rt.beginReconcile({ m1: { 7: tankData(200, 0) } });

    const body = bodyOf(rt, 'm1', '7');

    expect(body.x).toBeCloseTo(0, 6);
    expect(body.hasServer).toBe(true);
    expect(body.lastServer.x).toBeCloseTo(200, 6);
  });

  it('finishReconcile переносит расхождение replay в error', () => {
    rt.capture(tankObb(-15, 0), 1000);

    rt.beginReconcile({ m1: { 7: tankData(0, 0) } });
    bodyOf(rt, 'm1', '7').x = 10; // имитация replay, сдвинувшего тело
    rt.finishReconcile();

    expect(bodyOf(rt, 'm1', '7').error.x).toBeCloseTo(-10, 6);
  });

  it('слишком большое расхождение снапается в ноль', () => {
    rt.capture(tankObb(-15, 0), 1000);

    rt.beginReconcile({ m1: { 7: tankData(0, 0) } });
    bodyOf(rt, 'm1', '7').x = 100; // больше ERROR_SNAP_DISTANCE (24)
    rt.finishReconcile();

    expect(bodyOf(rt, 'm1', '7').error).toEqual({ x: 0, y: 0, angle: 0 });
  });

  it('beginReconcile без снапшота — no-op', () => {
    expect(() => rt.beginReconcile(null)).not.toThrow();
    expect(() => rt.finishReconcile()).not.toThrow();
  });
});

describe('RemoteTanks: удержание и возврат в follow', () => {
  let rt;

  beforeEach(() => {
    rt = new RemoteTanks(models);
    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.capture(tankObb(-15, 0), 1000);
  });

  it('demoteIdle не трогает тело в пределах PREDICTION_HOLD_MS', () => {
    rt.demoteIdle(1200); // +200мс < 300

    expect(bodyOf(rt, 'm1', '7').mode).toBe('predicted');
  });

  it('demoteIdle возвращает в follow после удержания при схождении', () => {
    // follow и предсказание совпадают (тело не двигалось)
    rt.demoteIdle(1500); // +500мс > 300

    const body = bodyOf(rt, 'm1', '7');

    expect(body.mode).toBe('follow');
    expect(body.vx).toBe(0);
    expect(body.error).toEqual({ x: 0, y: 0, angle: 0 });
  });

  it('demoteIdle не возвращает тело, если предсказание разошлось с follow', () => {
    rt.update({ m1: { 7: tankData(500, 500) } }); // follow далеко уехал

    rt.demoteIdle(1500);

    expect(bodyOf(rt, 'm1', '7').mode).toBe('predicted');
  });

  it('noteContacts продлевает удержание', () => {
    const body = bodyOf(rt, 'm1', '7');

    rt.noteContacts([body], 1400);
    rt.demoteIdle(1500); // +100мс от нового contactTime < 300

    expect(body.mode).toBe('predicted');
  });
});

describe('RemoteTanks: интеграция и затухание ошибки', () => {
  it('integratePredicted шагает только предсказанные тела', () => {
    const rt = new RemoteTanks(models);

    // скорость приходит только с авторитетным кадром (см. beginReconcile) —
    // update() из интерполированного сэмпла её не несёт
    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.beginReconcile({ m1: { 7: tankData(0, 0, 0, 10, 0) } });
    rt.capture(tankObb(-15, 0), 1000);
    rt.integratePredicted(0.1);

    expect(bodyOf(rt, 'm1', '7').x).toBeGreaterThan(0);
  });

  it('decayError затухает экспоненциально, как у своего танка', () => {
    const rt = new RemoteTanks(models);

    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.capture(tankObb(-15, 0), 1000);
    bodyOf(rt, 'm1', '7').error = { x: 10, y: -4, angle: 0.2 };

    rt.decayError(50); // множитель 1 − 0.05·10 = 0.5

    expect(bodyOf(rt, 'm1', '7').error.x).toBeCloseTo(5, 6);
    expect(bodyOf(rt, 'm1', '7').error.y).toBeCloseTo(-2, 6);
    expect(bodyOf(rt, 'm1', '7').error.angle).toBeCloseTo(0.1, 6);
  });
});

describe('RemoteTanks: getRenderData', () => {
  it('null без предсказанных тел', () => {
    const rt = new RemoteTanks(models);

    rt.update({ m1: { 7: tankData(0, 0) } });

    expect(rt.getRenderData()).toBeNull();
  });

  it('снапшот-формат для предсказанного тела (11 полей, включая angvel)', () => {
    const rt = new RemoteTanks(models);

    rt.update({ m1: { 7: tankData(0, 0, 0.5) } });
    // vx/vy/angvel приходят авторитетным кадром, не интерполированным сэмплом
    rt.beginReconcile({ m1: { 7: tankData(0, 0, 0.5, 3, -1, 0.7) } });
    rt.capture(tankObb(-15, 0), 1000);

    const data = rt.getRenderData();

    expect(data.m1['7']).toEqual([
      0, 0, 0.5, 0, 3, -1, 0, 3, 10, 1, 0.7,
    ]);
  });

  it('несколько моделей группируются отдельно', () => {
    const rt = new RemoteTanks({
      m1: models.m1,
      m2: models.m1,
    });

    rt.update({
      m1: { 7: tankData(0, 0) },
      m2: { 3: tankData(100, 0) },
    });
    rt.capture({ x: 50, y: 0, angle: 0, halfW: 250, halfH: 250 }, 1000);

    const data = rt.getRenderData();

    expect(Object.keys(data).sort()).toEqual(['m1', 'm2']);
  });
});

describe('RemoteTanks: reset', () => {
  it('очищает все тела', () => {
    const rt = new RemoteTanks(models);

    rt.update({ m1: { 7: tankData(0, 0) } });
    rt.capture(tankObb(-15, 0), 1000);
    rt.reset();

    expect(rt.getPredictedBodies()).toEqual([]);
    expect(rt.getRenderData()).toBeNull();

    // после reset тело заводится заново как follow
    rt.update({ m1: { 7: tankData(1, 1) } });

    expect(bodyOf(rt, 'm1', '7').mode).toBe('follow');
  });
});
