import { describe, it, expect, vi } from 'vitest';
import { Vec2 } from 'planck';
import Tank from '../../src/server/parts/Tank.js';

// мок физического тела (только методы, нужные для тестируемой логики)
const makeBody = () => ({
  gunRotation: 0,
  _pos: Vec2(0, 0),
  _angle: 0,
  _vel: Vec2(0, 0),
  createFixture: vi.fn(),
  setUserData: vi.fn(),
  getMass: () => 10,
  getInertia: () => 5,
  getPosition() {
    return this._pos;
  },
  getAngle() {
    return this._angle;
  },
  getLinearVelocity() {
    return this._vel;
  },
  setLinearVelocity: vi.fn(),
  setAngularVelocity: vi.fn(),
  setPosition(p) {
    this._pos = p;
  },
  setAngle(a) {
    this._angle = a;
  },
});

// мок панели с состоянием здоровья
const makePanel = () => {
  const state = { g1: { health: 100 } };
  return {
    setActiveWeapon: vi.fn(),
    getCurrentValue: (id, p) => state[id]?.[p],
    hasResources: (id, p, v) => (state[id]?.[p] ?? 0) >= v,
    updateUser(id, p, value, op) {
      state[id] = state[id] || {};
      const cur = state[id][p] ?? 0;
      state[id][p] =
        op === 'set' ? value : op === 'decrement' ? cur - value : cur + value;
    },
  };
};

const modelData = {
  size: 10,
  accelerationFactor: 1,
  brakingFactor: 1,
  baseTurnTorqueFactor: 1,
  maxForwardSpeed: 100,
  maxReverseSpeed: -50,
  lateralGrip: 1,
  maxGunAngle: 1,
  gunRotationSpeed: 1,
  gunCenterSpeed: 1,
  damping: { angular: 0.01, linear: 0.01 },
  fixture: {},
};

const makeTank = (body = makeBody(), panel = makePanel()) =>
  new Tank({
    model: 'm1',
    name: 'Alice',
    gameId: 'g1',
    teamId: 1,
    currentWeapon: 'w1',
    weapons: { w1: { type: 'hitscan', fireRate: 0.1, spread: 0 } },
    playerKeys: { keys: { forward: 1, fire: 128 }, oneShotMask: 128 },
    services: { panel },
    modelData,
    world: { createBody: () => body },
    position: [0, 0],
    angle: 0,
  });

describe('Tank.takeDamage: автомат состояний', () => {
  it('новый танк жив и в норме (condition 3)', () => {
    const tank = makeTank();
    expect(tank.isAlive()).toBe(true);
  });

  it('незначительные повреждения при health < 70', () => {
    const panel = makePanel();
    const tank = makeTank(makeBody(), panel);
    tank.takeDamage(40); // 100 -> 60
    expect(tank.isAlive()).toBe(true);
    expect(panel.getCurrentValue('g1', 'health')).toBe(60);
  });

  it('уничтожение при достижении 0 останавливает танк', () => {
    const body = makeBody();
    const tank = makeTank(body);

    const destroyed = tank.takeDamage(100);
    expect(destroyed).toBe(true);
    expect(tank.isAlive()).toBe(false);
    expect(body.setLinearVelocity).toHaveBeenCalled();
    expect(body.setAngularVelocity).toHaveBeenCalledWith(0);
  });

  it('повторный урон по уничтоженному танку не проходит', () => {
    const tank = makeTank();
    tank.takeDamage(100);
    expect(tank.takeDamage(50)).toBe(false);
  });

  it('здоровье не уходит ниже 0', () => {
    const panel = makePanel();
    const tank = makeTank(makeBody(), panel);
    tank.takeDamage(999);
    expect(panel.getCurrentValue('g1', 'health')).toBe(0);
  });
});

describe('Tank._getSpeedRatio', () => {
  it('доля скорости вперёд', () => {
    const tank = makeTank();
    expect(tank._getSpeedRatio(50)).toBe(0.5); // 50/100
  });

  it('доля скорости назад по модулю', () => {
    const tank = makeTank();
    expect(tank._getSpeedRatio(-25)).toBe(0.5); // |-25/-50|
  });

  it('ноль при нулевой скорости', () => {
    const tank = makeTank();
    expect(tank._getSpeedRatio(0)).toBe(0);
  });

  it('зажимается в 1 при превышении максимума', () => {
    const tank = makeTank();
    expect(tank._getSpeedRatio(200)).toBe(1);
  });
});

describe('Tank: прицеливание', () => {
  it('getMuzzlePosition при нулевом угле смещён вперёд', () => {
    const tank = makeTank();
    const muzzle = tank.getMuzzlePosition();
    // width = size*4 = 40; смещение = width*0.55 = 22 по X
    expect(muzzle.x).toBeCloseTo(22);
    expect(muzzle.y).toBeCloseTo(0);
  });

  it('getFireDirection без разброса направлен по углу танка', () => {
    const tank = makeTank();
    const dir = tank.getFireDirection('w1');
    expect(dir.x).toBeCloseTo(1);
    expect(dir.y).toBeCloseTo(0);
  });

  it('поворот башни смещает направление выстрела', () => {
    const body = makeBody();
    const tank = makeTank(body);
    // конструктор сбрасывает gunRotation в 0, поэтому задаём после создания
    body.gunRotation = Math.PI / 2; // башня на 90°

    const dir = tank.getFireDirection('w1');
    expect(dir.x).toBeCloseTo(0);
    expect(dir.y).toBeCloseTo(1);
  });
});

describe('Tank: данные и респаун', () => {
  it('getData возвращает состояние с condition, size и teamId', () => {
    const tank = makeTank();
    const data = tank.getData();

    expect(data[7]).toBe(3); // condition
    expect(data[8]).toBe(10); // size
    expect(data[9]).toBe(1); // teamId
  });

  it('getPosition округляет до 2 знаков', () => {
    const body = makeBody();
    body._pos = Vec2(1.2345, 6.789);
    const tank = makeTank(body);

    expect(tank.getPosition()).toEqual([1.23, 6.79]);
  });

  it('getShotData возвращает данные один раз', () => {
    const tank = makeTank();
    tank._shotData = { foo: 'bar' };

    expect(tank.getShotData()).toEqual({ foo: 'bar' });
    expect(tank.getShotData()).toBeNull(); // сброшено
  });

  it('changePlayerData переносит танк и сбрасывает управление', () => {
    const body = makeBody();
    const tank = makeTank(body);

    tank.changePlayerData({ respawnData: [100, 200, 90], teamId: 2 });

    expect(body._pos.x).toBe(100);
    expect(body._pos.y).toBe(200);
    expect(tank.teamId).toBe(2);
    expect(body.setLinearVelocity).toHaveBeenCalled();
    expect(body.gunRotation).toBe(0);
  });
});
