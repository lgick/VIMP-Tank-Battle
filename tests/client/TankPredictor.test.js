import { describe, it, expect, beforeEach } from 'vitest';
import TankPredictor from '../../src/client/TankPredictor.js';

// точность реплики против реального Rapier проверяет
// tests/server/TankPredictorParity.test.js; здесь — логика предиктора:
// ввод/история/аккумулятор/reconciliation/visualError

const STEP = 1000 / 120;

const playerKeys = {
  forward: { key: 1 },
  back: { key: 2 },
  left: { key: 4 },
  right: { key: 8 },
  gunCenter: { key: 16, type: 1 },
  gunLeft: { key: 32 },
  gunRight: { key: 64 },
  fire: { key: 128, type: 1 },
};

const models = {
  m1: {
    // габарит 4:3 от size и плотность — для двухтельных контактов
    size: 2,
    fixture: { density: 200, friction: 0.5, restitution: 0.1 },
    accelerationFactor: 1000,
    brakingFactor: 0.3,
    maxForwardSpeed: 260,
    maxReverseSpeed: -130,
    baseTurnTorqueFactor: 215,
    damping: { linear: 3, angular: 100 },
    lateralGrip: 20,
    maxGunAngle: 1.4,
    gunRotationSpeed: 3,
    gunCenterSpeed: 10,
    turnSpeedThreshold: 10,
    baseTurnFactorRatio: 0.8,
    reverseTurnMultiplier: 0.7,
    throttleIncreaseRate: 2,
    throttleDecreaseRate: 2.5,
    strainFactor: 1.5,
  },
};

const zeroState = () => ({
  x: 0,
  y: 0,
  angle: 0,
  vx: 0,
  vy: 0,
  angvel: 0,
  gunRotation: 0,
  throttle: 0,
});

const makePredictor = () => {
  const p = new TankPredictor({ timeStep: STEP, playerKeys, models });

  p.setModel('m1');
  p.setActive(true);
  p._state = zeroState();
  p._hasState = true;
  p._pendingReset = false;

  return p;
};

let predictor;

beforeEach(() => {
  predictor = makePredictor();
});

describe('TankPredictor: ввод и история', () => {
  it('down/up обновляют маску, one-shot копится отдельно', () => {
    predictor.applyInput('down', 'forward', 0);
    predictor.applyInput('down', 'gunCenter', 1);

    expect(predictor._keysMask).toBe(1);
    expect(predictor._oneShotPending).toBe(16);

    predictor.applyInput('up', 'forward', 2);
    expect(predictor._keysMask).toBe(0);
    expect(predictor._history.length).toBe(3);
  });

  it('неизвестная клавиша игнорируется', () => {
    predictor.applyInput('down', 'nextPlayer', 0);

    expect(predictor._history.length).toBe(0);
  });

  it('старые записи истории подрезаются с сохранением базовой маски', () => {
    predictor.applyInput('down', 'forward', 0);
    predictor.applyInput('down', 'left', 5000); // запись @0 старше 2с

    expect(predictor._history.length).toBe(1);
    expect(predictor._baseKeysMask).toBe(1); // forward действовал до истории
  });
});

describe('TankPredictor: симуляция', () => {
  it('update шагает фикс-шагом и двигает танк при forward', () => {
    predictor.applyInput('down', 'forward', 0);
    predictor.update(0); // инициализация времени
    predictor.update(STEP * 10);

    expect(predictor._state.x).toBeGreaterThan(0);
    expect(predictor._state.vx).toBeGreaterThan(0);
    expect(predictor._state.throttle).toBeGreaterThan(0);
  });

  it('freeze останавливает симуляцию', () => {
    predictor.applyInput('down', 'forward', 0);
    predictor.freeze(true);
    predictor.update(0);
    predictor.update(STEP * 10);

    expect(predictor._state.x).toBe(0);
  });

  it('неактивный предиктор не имеет состояния для рендера', () => {
    predictor.setActive(false);

    expect(predictor.hasState).toBe(false);
    expect(predictor.getRenderState()).toBeNull();
  });

  it('getRenderState добавляет визуальную ошибку к позиции', () => {
    predictor._visualError = { x: 5, y: -3, angle: 0.1 };

    const render = predictor.getRenderState();

    expect(render.x).toBe(5);
    expect(render.y).toBe(-3);
    expect(render.angle).toBeCloseTo(0.1);
  });
});

describe('TankPredictor: reconciliation', () => {
  it('replay истории от серверного состояния совпадает с непрерывным предиктом', () => {
    // A — непрерывный предикт: forward с t=0, 12 шагов
    const a = makePredictor();

    a.applyInput('down', 'forward', 0);
    a.update(0);
    a.update(STEP * 12);

    // B — «сервер подтвердил» нулевое состояние на t=0, replay до t=12 шагов
    const b = makePredictor();

    b.applyInput('down', 'forward', 0);
    b.onServerState(
      { state: [0, 0, 0, 0, 0, 0, 0, 0], centering: false },
      0, // serverTime
      0, // offset (серверная шкала = локальной)
      STEP * 12, // localNow
    );

    expect(b._state.x).toBeCloseTo(a._state.x, 6);
    expect(b._state.vx).toBeCloseTo(a._state.vx, 6);
    expect(b._state.throttle).toBeCloseTo(a._state.throttle, 6);
  });

  it('расхождение уходит в visualError и затухает', () => {
    predictor._state.x = 50; // старое предсказание

    predictor.onServerState(
      { state: [40, 0, 0, 0, 0, 0, 0, 0], centering: false },
      0,
      0,
      0,
    );

    // ошибка = старое (50) − новое (40) = 10: рендер остаётся на старом месте
    expect(predictor._visualError.x).toBeCloseTo(10);
    expect(predictor.getRenderState().x).toBeCloseTo(50);

    // затухание за кадр
    predictor.update(0);
    predictor.update(16);
    expect(Math.abs(predictor._visualError.x)).toBeLessThan(10);
  });

  it('слишком большое расхождение снапится без сглаживания', () => {
    predictor._state.x = 500;

    predictor.onServerState(
      { state: [0, 0, 0, 0, 0, 0, 0, 0], centering: false },
      0,
      0,
      0,
    );

    expect(predictor._visualError.x).toBe(0);
    expect(predictor.getRenderState().x).toBe(0);
  });

  it('после reset состояние берётся без replay и без ошибки', () => {
    predictor.applyInput('down', 'forward', 0);
    predictor._state.x = 99;
    predictor.reset();

    expect(predictor._keysMask).toBe(0); // сервер сбрасывает клавиши тоже
    expect(predictor._history.length).toBe(0);

    predictor.onServerState(
      { state: [7, 8, 0, 0, 0, 0, 0, 0], centering: false },
      0,
      0,
      STEP * 30, // «прошло время» — но replay после reset не применяется
    );

    expect(predictor._state.x).toBe(7);
    expect(predictor._visualError.x).toBe(0);
  });

  it('reset обнуляет состояние: до нового player-блока рендерить нечего', () => {
    predictor._state.x = 99;
    predictor.freeze(true);
    predictor.reset();

    expect(predictor.hasState).toBe(false);
    expect(predictor.getRenderState()).toBeNull();
    expect(predictor._frozen).toBe(false);

    predictor.onServerState(
      { state: [7, 8, 0, 0, 0, 0, 0, 0], centering: false },
      0,
      0,
      0,
    );

    expect(predictor.hasState).toBe(true);
    expect(predictor.getRenderState().x).toBe(7);
  });
});

describe('TankPredictor: столкновения', () => {
  // сетка 3×3 клетки по 40 юнитов; сплошная колонна справа (x >= 80)
  const wallGrid = {
    map: [
      [0, 0, 1],
      [0, 0, 1],
      [0, 0, 1],
    ],
    step: 40,
    scale: 1,
    physicsStatic: [1],
  };

  // минимальный двойник MapDynamics с одним предсказанным ящиком
  const makeBoxDynamics = box => ({
    calls: { capture: 0, release: 0 },
    capture() {
      this.calls.capture += 1;
    },
    integratePredicted: () => {},
    getPredictedBodies: () => [box],
    noteContacts: () => {},
    demoteIdle: () => {},
    decayError: () => {},
    releasePredicted() {
      this.calls.release += 1;
    },
  });

  const makeBox = (over = {}) => ({
    x: 40,
    y: 20,
    angle: 0,
    vx: 0,
    vy: 0,
    angvel: 0,
    invMass: 1 / 7373,
    invInertia: 1 / 452985,
    linearDamping: 0,
    angularDamping: 0,
    halfW: 10,
    halfH: 10,
    friction: 0.2,
    restitution: 0,
    ...over,
  });

  it('без setMap и без mapDynamics столкновений нет (инвариант паритета)', () => {
    // предиктор без карты стоит внутри стены — и всё равно едет как в пустоте
    const reference = makePredictor();

    reference.setMap({ map: [[0]], step: 40, scale: 1, physicsStatic: [] });

    for (const p of [predictor, reference]) {
      p._state.x = 85;
      p._state.vx = 100;
      p._step(0);
    }

    expect(predictor._state).toEqual(reference._state);
  });

  it('упор в стену: танк останавливается и не проникает внутрь', () => {
    predictor.setMap(wallGrid);
    predictor._state.x = 74; // правый край танка 78, стена начинается с 80
    predictor._state.vx = 300;

    for (let i = 0; i < 60; i += 1) {
      predictor._step(0);
    }

    // корпус не заходит за грань стены и не улетел сквозь неё
    expect(predictor._state.x + 4).toBeLessThanOrEqual(80.001);
    expect(predictor._state.vx).toBeLessThan(1);
  });

  it('удар углом корпуса о стену разворачивает танк', () => {
    predictor.setMap(wallGrid);
    predictor._state.x = 74;
    predictor._state.y = 20;
    predictor._state.angle = 0.4; // корпус повёрнут — в стену войдёт угол
    predictor._state.vx = 300;

    predictor._step(0);

    expect(predictor._state.angvel).not.toBe(0);
  });

  it('контакт с ящиком двигает ящик (регресс на «бесконечную массу»)', () => {
    const box = makeBox();

    predictor._predictedSets = [makeBoxDynamics(box)];
    predictor._state.x = 26; // правый край танка 30, левая грань ящика 30
    predictor._state.y = 20;
    predictor._state.vx = 200;

    for (let i = 0; i < 30; i += 1) {
      predictor._step(0);
    }

    expect(box.x).toBeGreaterThan(40);
    expect(box.vx).toBeGreaterThan(0);
  });

  it('танк теряет скорость, толкая ящик (импульс уходит в тело)', () => {
    const box = makeBox();

    predictor._predictedSets = [makeBoxDynamics(box)];
    predictor._state.x = 26;
    predictor._state.y = 20;
    predictor._state.vx = 200;

    predictor._step(0);

    expect(predictor._state.vx).toBeLessThan(200);
  });

  // регресс: demoteIdle зовётся только из шага симуляции, а рендер
  // предсказанных тел перекрывает интерполяцию каждый кадр — остановившийся
  // предиктор оставлял ящик/чужой танк застывшим на экране навсегда
  it('без шага симуляции подсистемы отпускают предсказанные тела', () => {
    const set = makeBoxDynamics(makeBox());

    predictor._predictedSets = [set];
    predictor.setActive(false); // спектатор: шага нет

    predictor.update(1000);
    predictor.update(1016);

    expect(set.calls.release).toBeGreaterThan(0);
  });

  it('заморозка (танк уничтожен) снимает контакты и захват тел', () => {
    const box = makeBox();
    const set = makeBoxDynamics(box);

    predictor._predictedSets = [set];
    predictor.freeze(true);
    predictor._state.x = 26; // правый край танка 30, левая грань ящика 30
    predictor._state.y = 20;
    predictor._state.vx = 200;

    predictor._step(0);

    expect(set.calls.capture).toBe(0);
    expect(box.x).toBe(40);
    expect(box.vx).toBe(0);
  });

  it('ящик вне контакта танк не трогает', () => {
    const box = makeBox({ x: 400 });
    const reference = makePredictor();

    predictor._predictedSets = [makeBoxDynamics(box)];

    for (const p of [predictor, reference]) {
      p._state.vx = 100;
      p._step(0);
    }

    expect(box.x).toBe(400);
    expect(box.vx).toBe(0);
    expect(predictor._state).toEqual(reference._state);
  });
});
