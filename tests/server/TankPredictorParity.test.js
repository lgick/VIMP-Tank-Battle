import { describe, it, expect, beforeEach, vi } from 'vitest';
import RAPIER from '../../src/server/physics/rapier.js';
import TankPredictor from '../../src/client/TankPredictor.js';
import models from '../../src/data/models.js';
import gameConfig from '../../src/config/game.js';

// Паритет клиентской реплики движения (TankPredictor) с реальным сервером:
// реальный Tank в реальном Rapier-мире без стен против TankPredictor._step
// с одинаковым вводом. Тест фиксирует формулу damping и порядок операций;
// допуски покрывают разницу f32-математики Rapier и f64 в JS.

const TIME_STEP_MS = 1000 / 120;
const DT = TIME_STEP_MS / 1000;

const playerKeys = gameConfig.playerKeys;

let Tank;

// битовые маски клавиш из конфига
const bit = name => playerKeys[name].key;

// мок панели с бесконечным здоровьем/боезапасом (стрельба не участвует)
const makePanel = () => ({
  setActiveWeapon: vi.fn(),
  getCurrentValue: () => 100,
  hasResources: () => true,
  updateUser: vi.fn(),
});

// реальный танк в реальном пустом мире Rapier
const makeRealTank = (world, position = [0, 0], angle = 0) => {
  const keys = {};
  let oneShotMask = 0;

  for (const name in playerKeys) {
    if (Object.hasOwn(playerKeys, name)) {
      keys[name] = playerKeys[name].key;

      if (playerKeys[name].type === 1) {
        oneShotMask |= playerKeys[name].key;
      }
    }
  }

  return new Tank({
    model: 'm1',
    name: 'Server',
    gameId: '1',
    teamId: 1,
    currentWeapon: 'w1',
    weapons: { w1: { type: 'hitscan', fireRate: 0.1, spread: 0 } },
    playerKeys: { keys, oneShotMask },
    services: { panel: makePanel() },
    modelData: models.m1,
    world,
    position,
    angle,
  });
};

// предиктор с состоянием, синхронизированным со стартом танка
const makePredictor = (position = [0, 0], angleRad = 0) => {
  const predictor = new TankPredictor({
    timeStep: TIME_STEP_MS,
    playerKeys,
    models,
  });

  predictor.setModel('m1');
  predictor._state = {
    x: position[0],
    y: position[1],
    angle: angleRad,
    vx: 0,
    vy: 0,
    angvel: 0,
    gunRotation: 0,
    throttle: 0,
  };
  predictor._hasState = true;

  return predictor;
};

// прогоняет обе симуляции по сценарию: { шаг: маска клавиш }
// маска действует с указанного шага до следующего изменения
const simulate = (steps, schedule) => {
  const world = new RAPIER.World({ x: 0, y: 0 });

  world.timestep = DT;

  const tank = makeRealTank(world);
  const predictor = makePredictor();

  // применение масок к серверному танку через down/up по диффу
  let currentMask = 0;

  const applyMask = newMask => {
    for (const name in playerKeys) {
      if (Object.hasOwn(playerKeys, name)) {
        const keyBit = playerKeys[name].key;
        const was = currentMask & keyBit;
        const now = newMask & keyBit;

        if (!was && now) {
          tank.updateKeys({ action: 'down', name });
        } else if (was && !now) {
          tank.updateKeys({ action: 'up', name });
        }
      }
    }

    currentMask = newMask;
  };

  for (let i = 0; i < steps; i += 1) {
    if (schedule[i] !== undefined) {
      applyMask(schedule[i]);
    }

    tank.updateData(DT);
    world.step();

    // one-shot биты в маске предиктора действуют только на шаге назначения
    const oneShotNow = schedule[i] !== undefined ? schedule[i] : 0;

    predictor._step(currentMask | (oneShotNow & predictor._oneShotMask));
  }

  return { server: tank.getPredictionState(), predictor };
};

const expectClose = ({ server, predictor }, tolerance = 0.5) => {
  const p = predictor._state;

  expect(p.x).toBeCloseTo(server.state[0], Math.log10(1 / tolerance));
  expect(Math.abs(p.x - server.state[0])).toBeLessThan(tolerance);
  expect(Math.abs(p.y - server.state[1])).toBeLessThan(tolerance);
  expect(Math.abs(p.angle - server.state[2])).toBeLessThan(0.02);
  expect(Math.abs(p.vx - server.state[3])).toBeLessThan(tolerance);
  expect(Math.abs(p.vy - server.state[4])).toBeLessThan(tolerance);
  expect(Math.abs(p.gunRotation - server.state[6])).toBeLessThan(0.01);
  expect(Math.abs(p.throttle - server.state[7])).toBeLessThan(0.001);
};

beforeEach(async () => {
  vi.resetModules();
  Tank = (await import('../../src/server/parts/Tank.js')).default;
});

describe('Паритет реплики движения с сервером (реальный Rapier)', () => {
  it('разгон вперёд (1 секунда)', () => {
    expectClose(simulate(120, { 0: bit('forward') }));
  });

  it('разгон с поворотом направо', () => {
    expectClose(simulate(120, { 0: bit('forward') | bit('right') }));
  });

  it('газ → отпустил → активное торможение', () => {
    expectClose(
      simulate(150, {
        0: bit('forward'),
        90: 0,
      }),
    );
  });

  it('задний ход с поворотом налево', () => {
    expectClose(simulate(120, { 0: bit('back') | bit('left') }));
  });

  it('поворот башни и центрирование (one-shot gunCenter)', () => {
    const result = simulate(90, {
      0: bit('gunRight'),
      40: bit('gunCenter'), // one-shot: отпустили gunRight, центрируем
    });

    expectClose(result);
  });

  it('без ввода танк остаётся на месте', () => {
    expectClose(simulate(60, {}), 0.001);
  });
});
