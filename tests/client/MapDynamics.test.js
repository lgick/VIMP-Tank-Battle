import { describe, it, expect, beforeEach } from 'vitest';
import MapDynamics from '../../src/client/MapDynamics.js';

// один ящик: угол объекта (сервер) (100, 0), 0°, width 40/height 20 (мир,
// после scale) → halfW 20, halfH 10 → центр (120, 10)
const setup = (scale = 1) => {
  const md = new MapDynamics();

  md.setMap({
    physicsDynamic: [
      { position: [100, 0], angle: 0, width: 40, height: 20, density: 1 },
    ],
    scale,
    setId: 'c1',
  });

  return md;
};

// OBB танка (центр), которым проверяется захват тел в предсказание
const tankObb = (x, y) => ({ x, y, angle: 0, halfW: 4, halfH: 3 });

// внутреннее состояние тела (симуляция, без сглаживающей ошибки)
const bodyOf = (md, key) => md._bodies[key];

describe('MapDynamics: setMap (угол объекта → центр)', () => {
  it('строит бокс с центром, а не углом объекта', () => {
    const md = setup();
    const box = md.getBox('d0');

    expect(box).toEqual({ x: 120, y: 10, angle: 0, halfW: 20, halfH: 10 });
  });

  it('учитывает scale карты', () => {
    const md = setup(2);
    const box = md.getBox('d0');

    // угол мира: (200, 0); halfW 40, halfH 20 → центр (240, 20)
    expect(box).toEqual({ x: 240, y: 20, angle: 0, halfW: 40, halfH: 20 });
  });

  it('неизвестный ключ — null', () => {
    const md = setup();

    expect(md.getBox('d1')).toBeNull();
  });
});

describe('MapDynamics: update (снапшот/интерполированный сэмпл)', () => {
  let md;

  beforeEach(() => {
    md = setup();
  });

  it('обновляет трансформ по ключу c*, сохраняя halfW/halfH', () => {
    md.update({ c1: { d0: [500, 50, Math.PI / 2] } });

    const box = md.getBox('d0');

    // угол (500,50) + rotateVec((20,10), 90°) = (500-10, 50+20) = (490, 70)
    expect(box.x).toBeCloseTo(490, 6);
    expect(box.y).toBeCloseTo(70, 6);
    expect(box.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(box.halfW).toBe(20);
    expect(box.halfH).toBe(10);
  });

  it('игнорирует ключи не из динамики карты (танки и т.п.)', () => {
    const before = md.getBox('d0');

    md.update({ m1: { 1: [1, 2, 3] } });

    expect(md.getBox('d0')).toEqual(before);
  });

  it('игнорирует неизвестные dN внутри cN', () => {
    md.update({ c1: { d9: [1, 2, 3] } });

    expect(md.getBox('d9')).toBeNull();
  });

  it('null/undefined game — no-op', () => {
    const before = md.getBox('d0');

    md.update(null);

    expect(md.getBox('d0')).toEqual(before);
  });
});

describe('MapDynamics: toLocal', () => {
  it('переводит мировую точку в локальный (неповёрнутый) фрейм ящика', () => {
    const md = setup(); // box: центр (120, 10), angle 0

    const local = md.toLocal('d0', 130, 15);

    expect(local).toEqual({ x: 10, y: 5 });
  });

  it('учитывает поворот ящика', () => {
    const md = setup();

    md.update({ c1: { d0: [100, 0, Math.PI / 2] } });

    const box = md.getBox('d0');
    // мировая точка на +X от центра; при повороте бокса на 90° это
    // соответствует локальной −Y (toLocal вращает на −angle)
    const worldX = box.x + 20;
    const worldY = box.y;
    const local = md.toLocal('d0', worldX, worldY);

    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(-20, 6);
  });

  it('неизвестный ключ — null', () => {
    const md = setup();

    expect(md.toLocal('d9', 0, 0)).toBeNull();
  });
});

describe('MapDynamics: getBoxes/замена геометрии', () => {
  it('getBoxes отдаёт все боксы разом', () => {
    const md = new MapDynamics();

    md.setMap({
      physicsDynamic: [
        { position: [0, 0], angle: 0, width: 10, height: 10 },
        { position: [50, 50], angle: 0, width: 10, height: 10 },
      ],
      scale: 1,
    });

    expect(Object.keys(md.getBoxes()).sort()).toEqual(['d0', 'd1']);
  });

  it('повторный setMap полностью заменяет геометрию', () => {
    const md = setup();

    md.setMap({ physicsDynamic: [], scale: 1 });

    expect(md.getBox('d0')).toBeNull();
    expect(md.getBoxes()).toEqual({});
  });

  // регресс: CLEAR приходит и на старте раунда, без MAP_DATA следом
  // (RoundManager._startRound). Метода сброса нет намеренно — иначе боксы
  // стирались бы навсегда: update() обновляет только известные ключи
  it('сброса геометрии не существует: она живёт до следующей MAP_DATA', () => {
    const md = setup();

    expect(md.reset).toBeUndefined();

    // кадры после CLEAR продолжают двигать те же боксы
    md.update({ c1: { d0: [300, 0, 0] } });

    expect(md.getBox('d0').x).toBeCloseTo(320, 6);
  });
});

describe('MapDynamics: масс-инерционные свойства', () => {
  it('масса и момент считаются из density и масштабированных габаритов', () => {
    const md = setup(2); // 40×20 * 2 → 80×40, density 1

    const body = bodyOf(md, 'd0');
    const mass = 1 * 80 * 40;
    const inertia = (mass * (80 * 80 + 40 * 40)) / 12;

    expect(1 / body.invMass).toBeCloseTo(mass, 6);
    expect(1 / body.invInertia).toBeCloseTo(inertia, 3);
  });

  it('демпфирование берётся из данных карты (angular по умолчанию 0.01)', () => {
    const md = new MapDynamics();

    md.setMap({
      physicsDynamic: [
        { position: [0, 0], angle: 0, width: 10, height: 10, density: 1,
          linearDamping: 5 },
      ],
      scale: 1,
      setId: 'c1',
    });

    expect(bodyOf(md, 'd0').linearDamping).toBe(5);
    expect(bodyOf(md, 'd0').angularDamping).toBe(0.01);
  });

  it('все тела стартуют в режиме follow', () => {
    expect(bodyOf(setup(), 'd0').mode).toBe('follow');
  });
});

describe('MapDynamics: захват тел в предсказание', () => {
  it('follow → predicted при пересечении раздутым OBB танка', () => {
    const md = setup(); // ящик: центр (120, 10), halfW 20, halfH 10

    md.capture(tankObb(96, 10), 1000);

    expect(bodyOf(md, 'd0').mode).toBe('predicted');
    expect(md.getPredictedBodies()).toHaveLength(1);
  });

  it('далёкое тело остаётся в follow', () => {
    const md = setup();

    md.capture(tankObb(0, 0), 1000);

    expect(bodyOf(md, 'd0').mode).toBe('follow');
    expect(md.getPredictedBodies()).toEqual([]);
  });

  it('запас CAPTURE_MARGIN захватывает тело до фактического касания', () => {
    const md = setup();

    // правый край танка — 99, левая грань ящика — 100: зазор 1 юнит,
    // фактического пересечения нет, но CAPTURE_MARGIN (2) его перекрывает
    md.capture(tankObb(95, 10), 1000);

    expect(bodyOf(md, 'd0').mode).toBe('predicted');
  });

  it('транзитивный захват: сосед предсказанного тоже предсказывается', () => {
    const md = new MapDynamics();

    // три ящика 20×20 в ряд, вплотную: центры (10,10), (30,10), (50,10)
    md.setMap({
      physicsDynamic: [
        { position: [0, 0], angle: 0, width: 20, height: 20, density: 1 },
        { position: [20, 0], angle: 0, width: 20, height: 20, density: 1 },
        { position: [40, 0], angle: 0, width: 20, height: 20, density: 1 },
      ],
      scale: 1,
      setId: 'c1',
    });

    // танк касается только первого
    md.capture(tankObb(-3, 10), 1000);

    expect(bodyOf(md, 'd0').mode).toBe('predicted');
    expect(bodyOf(md, 'd1').mode).toBe('predicted');
    expect(bodyOf(md, 'd2').mode).toBe('predicted');
  });

  it('потолок MAX_PREDICTED_BODIES ограничивает множество', () => {
    const md = new MapDynamics();

    // стена из 20 ящиков вплотную — транзитивный захват втянул бы всю
    md.setMap({
      physicsDynamic: Array.from({ length: 20 }, (unused, i) => ({
        position: [i * 20, 0],
        angle: 0,
        width: 20,
        height: 20,
        density: 1,
      })),
      scale: 1,
      setId: 'c1',
    });

    md.capture(tankObb(-3, 10), 1000);

    expect(md.getPredictedBodies()).toHaveLength(12);
  });
});

describe('MapDynamics: реконсиляция', () => {
  it('beginReconcile принимает кадр из 3 чисел (покой): скорости нулевые', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [200, 0, 0] } });

    const body = bodyOf(md, 'd0');

    expect(body.x).toBeCloseTo(220, 6); // угол → центр
    expect(body.vx).toBe(0);
    expect(body.angvel).toBe(0);
  });

  it('beginReconcile принимает кадр из 6 чисел (со скоростями)', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [200, 0, 0, 40, -5, 1.5] } });

    const body = bodyOf(md, 'd0');

    expect(body.vx).toBe(40);
    expect(body.vy).toBe(-5);
    expect(body.angvel).toBe(1.5);
  });

  it('состояние follow-тел не подменяется, но lastServer запоминается', () => {
    const md = setup();
    const before = md.getBox('d0');

    md.beginReconcile({ c1: { d0: [200, 0, 0, 40, 0, 0] } });

    expect(md.getBox('d0')).toEqual(before);
    expect(bodyOf(md, 'd0').lastServer.x).toBeCloseTo(220, 6);
  });

  it('finishReconcile кладёт расхождение в error', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [100, 0, 0] } }); // центр (120, 10)

    // «replay» сдвинул тело на 3 юнита
    bodyOf(md, 'd0').x += 3;
    md.finishReconcile();

    expect(bodyOf(md, 'd0').error.x).toBeCloseTo(-3, 6);
  });

  it('finishReconcile снапит расхождение больше ERROR_SNAP_DISTANCE', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [100, 0, 0] } });

    bodyOf(md, 'd0').x += 100;
    md.finishReconcile();

    expect(bodyOf(md, 'd0').error).toEqual({ x: 0, y: 0, angle: 0 });
  });

  it('без блока setId в кадре — no-op', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ m1: { 1: [0, 0] } });
    md.finishReconcile();

    expect(bodyOf(md, 'd0').error).toEqual({ x: 0, y: 0, angle: 0 });
  });
});

describe('MapDynamics: симуляция и возврат в follow', () => {
  it('integratePredicted двигает только предсказанные тела', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    bodyOf(md, 'd0').vx = 100;
    md.integratePredicted(0.1);

    expect(bodyOf(md, 'd0').x).toBeCloseTo(130, 6);
  });

  it('update не трогает состояние предсказанного тела, но ведёт follow', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);

    const before = bodyOf(md, 'd0').x;

    md.update({ c1: { d0: [500, 0, 0] } });

    expect(bodyOf(md, 'd0').x).toBe(before);
    expect(bodyOf(md, 'd0').follow.x).toBeCloseTo(520, 6);
  });

  it('predicted → follow только после PREDICTION_HOLD_MS', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.update({ c1: { d0: [100, 0, 0] } }); // follow совпадает с состоянием

    md.demoteIdle(1200); // 200 мс < 300

    expect(bodyOf(md, 'd0').mode).toBe('predicted');

    md.demoteIdle(1400); // 400 мс > 300

    expect(bodyOf(md, 'd0').mode).toBe('follow');
  });

  it('несошедшееся тело остаётся предсказанным даже после таймаута', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.update({ c1: { d0: [100, 0, 0] } });
    bodyOf(md, 'd0').x += 10; // предсказание разошлось с интерполяцией

    md.demoteIdle(2000);

    expect(bodyOf(md, 'd0').mode).toBe('predicted');
  });

  it('noteContacts продлевает удержание в предсказании', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.update({ c1: { d0: [100, 0, 0] } });
    md.noteContacts(md.getPredictedBodies(), 1400);
    md.demoteIdle(1500);

    expect(bodyOf(md, 'd0').mode).toBe('predicted');
  });

  it('decayError затухает экспоненциально, как visualError танка', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    bodyOf(md, 'd0').error = { x: 10, y: -4, angle: 0.2 };

    md.decayError(50); // множитель 1 − 0.05·10 = 0.5

    expect(bodyOf(md, 'd0').error.x).toBeCloseTo(5, 6);
    expect(bodyOf(md, 'd0').error.y).toBeCloseTo(-2, 6);
    expect(bodyOf(md, 'd0').error.angle).toBeCloseTo(0.1, 6);
  });
});

describe('MapDynamics: рендерные данные', () => {
  it('getRenderData отдаёт «угол объекта», а не центр', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [300, 40, 0] } });

    const render = md.getRenderData();

    // обратный перевод центра в угол объекта возвращает исходные числа
    expect(render.c1.d0[0]).toBeCloseTo(300, 6);
    expect(render.c1.d0[1]).toBeCloseTo(40, 6);
    expect(render.c1.d0[2]).toBeCloseTo(0, 6);
  });

  it('getRenderData учитывает поворот при обратном переводе', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [300, 40, Math.PI / 2] } });

    const render = md.getRenderData();

    expect(render.c1.d0[0]).toBeCloseTo(300, 6);
    expect(render.c1.d0[1]).toBeCloseTo(40, 6);
  });

  it('getRenderData включает сглаживающую ошибку', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    md.beginReconcile({ c1: { d0: [300, 40, 0] } });
    bodyOf(md, 'd0').error = { x: 5, y: 0, angle: 0 };

    expect(md.getRenderData().c1.d0[0]).toBeCloseTo(305, 6);
  });

  it('без предсказанных тел getRenderData возвращает null', () => {
    const md = setup();

    expect(md.getRenderData()).toBeNull();
  });

  it('getRenderData не включает follow-тела', () => {
    const md = new MapDynamics();

    md.setMap({
      physicsDynamic: [
        { position: [0, 0], angle: 0, width: 20, height: 20, density: 1 },
        { position: [500, 0], angle: 0, width: 20, height: 20, density: 1 },
      ],
      scale: 1,
      setId: 'c1',
    });

    md.capture(tankObb(-3, 10), 1000);

    expect(Object.keys(md.getRenderData().c1)).toEqual(['d0']);
  });

  it('getBoxes для предсказанного тела включает error (рендерный бокс)', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    bodyOf(md, 'd0').error = { x: 7, y: -2, angle: 0 };

    expect(md.getBoxes().d0.x).toBeCloseTo(127, 6);
    expect(md.getBox('d0').y).toBeCloseTo(8, 6);
  });
});

describe('MapDynamics: симуляционные боксы (raycast)', () => {
  it('без авторитетного кадра — интерполированный трансформ', () => {
    const md = setup();

    md.update({ c1: { d0: [500, 0, 0] } });

    expect(md.getSimBoxes().d0.x).toBeCloseTo(520, 6);
  });

  it('follow-тело: авторитетный кадр, а не отстающая интерполяция', () => {
    const md = setup();

    md.beginReconcile({ c1: { d0: [300, 0, 0, 50, 0, 0] } });
    md.update({ c1: { d0: [100, 0, 0] } });

    expect(md.getSimBoxes().d0.x).toBeCloseTo(320, 6);
    expect(md.getBox('d0').x).toBeCloseTo(120, 6); // нарисован там, где отстаёт
  });

  it('предсказанное тело: своё состояние без сглаживающей ошибки', () => {
    const md = setup();

    md.capture(tankObb(96, 10), 1000);
    bodyOf(md, 'd0').error = { x: 7, y: -2, angle: 0 };

    expect(md.getSimBoxes().d0.x).toBeCloseTo(120, 6);
    expect(md.getBoxes().d0.x).toBeCloseTo(127, 6);
  });
});

describe('MapDynamics: toLocal/toWorld', () => {
  it('toLocal считает в симуляционном фрейме, toWorld — в рендерном', () => {
    const md = setup();

    md.beginReconcile({ c1: { d0: [300, 0, 0, 50, 0, 0] } });
    md.update({ c1: { d0: [100, 0, 0] } });

    // левая грань авторитетного бокса (центр 320, halfW 20)
    const local = md.toLocal('d0', 300, 10);

    expect(local.x).toBeCloseTo(-20, 6);
    expect(local.y).toBeCloseTo(0, 6);

    // та же материальная точка на нарисованном (отстающем) ящике
    const world = md.toWorld('d0', local.x, local.y);

    expect(world.x).toBeCloseTo(100, 6);
    expect(world.y).toBeCloseTo(10, 6);
  });

  it('toWorld для неизвестного ключа — null', () => {
    expect(setup().toWorld('d9', 0, 0)).toBeNull();
  });
});
