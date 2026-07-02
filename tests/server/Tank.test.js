import { describe, it, expect, vi } from 'vitest';
import { Vec2 } from '../../src/lib/vec2.js';
import Tank from '../../src/server/parts/Tank.js';

// мок физического тела Rapier (только методы, нужные для тестируемой логики)
const makeBody = () => ({
  gunRotation: 0,
  _pos: new Vec2(0, 0),
  _angle: 0,
  _vel: new Vec2(0, 0),
  mass: () => 10,
  principalInertia: () => 5,
  translation() {
    return this._pos;
  },
  rotation() {
    return this._angle;
  },
  linvel() {
    return this._vel;
  },
  setLinvel: vi.fn(),
  setAngvel: vi.fn(),
  setTranslation(p) {
    this._pos = p;
  },
  setRotation(a) {
    this._angle = a;
  },
});

// мок мира Rapier: отдаёт подготовленное тело, коллайдер не важен
const makeWorld = body => ({
  createRigidBody: () => body,
  createCollider: vi.fn(),
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
  fixture: { density: 200, friction: 0.5, restitution: 0.1 },
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
    world: makeWorld(body),
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
    expect(body.setLinvel).toHaveBeenCalled();
    expect(body.setAngvel).toHaveBeenCalledWith(0, true);
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

// --- updateData: полный набор клавиш и физическое тело ---

// биты клавиш; one-shot: fire/nextWeapon/prevWeapon
const fullKeys = {
  forward: 1,
  back: 2,
  left: 4,
  right: 8,
  gunCenter: 16,
  gunLeft: 32,
  gunRight: 64,
  fire: 128,
  nextWeapon: 256,
  prevWeapon: 512,
};
const oneShotMask = 128 | 256 | 512;

// тело с методами, нужными для физики updateData
// (мировые векторы Tank считает сам через rotation(): при нулевом угле
// мировой вектор совпадает с локальным)
const makePhysicsBody = () => ({
  ...makeBody(),
  applyImpulse: vi.fn(),
  applyTorqueImpulse: vi.fn(),
});

// панель с боезапасом для обоих орудий
const makeAmmoPanel = () => {
  const state = { g1: { health: 100, w1: 10, w2: 10 } };
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

const makeMovingTank = (body = makePhysicsBody(), panel = makeAmmoPanel()) =>
  new Tank({
    model: 'm1',
    name: 'Alice',
    gameId: 'g1',
    teamId: 1,
    currentWeapon: 'w1',
    weapons: {
      w1: { type: 'hitscan', fireRate: 0.1, spread: 0 },
      w2: { type: 'explosive', fireRate: 0.1, spread: 0 },
    },
    playerKeys: { keys: fullKeys, oneShotMask },
    services: { panel },
    modelData,
    world: makeWorld(body),
    position: [0, 0],
    angle: 0,
  });

describe('Tank.updateData: поворот башни', () => {
  it('gunLeft уводит башню в минус', () => {
    const tank = makeMovingTank();
    tank.updateKeys({ name: 'gunLeft', action: 'down' });
    tank.updateData(0.5); // rotationAmount = gunRotationSpeed(1) * 0.5
    expect(tank.getBody().gunRotation).toBeCloseTo(-0.5);
  });

  it('gunRight уводит башню в плюс с зажимом по maxGunAngle', () => {
    const tank = makeMovingTank();
    tank.updateKeys({ name: 'gunRight', action: 'down' });
    tank.updateData(2); // 0 + 2 > maxGunAngle(1) → зажим в 1
    expect(tank.getBody().gunRotation).toBeCloseTo(1);
  });

  it('gunCenter возвращает башню к нулю', () => {
    const body = makePhysicsBody();
    const tank = makeMovingTank(body);
    body.gunRotation = 0.5;

    tank.updateKeys({ name: 'gunCenter', action: 'down' });
    tank.updateData(0.5);

    // центрирование интерполирует к 0, оставаясь между 0 и исходным значением
    expect(body.gunRotation).toBeGreaterThan(0);
    expect(body.gunRotation).toBeLessThan(0.5);
  });
});

describe('Tank.updateData: стрельба', () => {
  it('fire собирает _shotData и списывает боезапас', () => {
    const panel = makeAmmoPanel();
    const tank = makeMovingTank(makePhysicsBody(), panel);

    tank.updateKeys({ name: 'fire', action: 'down' });
    tank.updateData(0.016);

    const shot = tank.getShotData();
    expect(shot).not.toBeNull();
    expect(shot).toHaveProperty('startPoint');
    expect(shot).toHaveProperty('direction');
    expect(panel.getCurrentValue('g1', 'w1')).toBe(9); // списан 1 патрон
  });

  it('fire без боезапаса не формирует выстрел', () => {
    const panel = makeAmmoPanel();
    panel.updateUser('g1', 'w1', 0, 'set'); // обнуляем патроны
    const tank = makeMovingTank(makePhysicsBody(), panel);

    tank.updateKeys({ name: 'fire', action: 'down' });
    tank.updateData(0.016);

    expect(tank.getShotData()).toBeNull();
  });

  it('повторный выстрел заблокирован кулдауном', () => {
    const tank = makeMovingTank();

    tank.updateKeys({ name: 'fire', action: 'down' });
    tank.updateData(0.016);
    expect(tank.getShotData()).not.toBeNull();

    // fire — one-shot, нужно нажать снова; но fireRate ещё не истёк
    tank.updateKeys({ name: 'fire', action: 'down' });
    tank.updateData(0.016);
    expect(tank.getShotData()).toBeNull();
  });
});

describe('Tank.updateData: движение и смена оружия', () => {
  it('forward разгоняет дроссель двигателя', () => {
    const tank = makeMovingTank();
    tank.updateKeys({ name: 'forward', action: 'down' });
    tank.updateData(0.1);
    expect(tank._engineThrottle).toBeGreaterThan(0);
  });

  it('отпускание газа сбрасывает дроссель к нулю', () => {
    const tank = makeMovingTank();
    tank.updateKeys({ name: 'forward', action: 'down' });
    tank.updateData(0.1);
    tank.updateKeys({ name: 'forward', action: 'up' });
    tank.updateData(1); // достаточно для полного сброса
    expect(tank._engineThrottle).toBe(0);
  });

  it('left применяет импульс крутящего момента', () => {
    const body = makePhysicsBody();
    const tank = makeMovingTank(body);
    tank.updateKeys({ name: 'left', action: 'down' });
    tank.updateData(0.1);
    expect(body.applyTorqueImpulse).toHaveBeenCalled();
  });

  it('nextWeapon переключает на следующее орудие', () => {
    const tank = makeMovingTank();
    expect(tank.currentWeapon).toBe('w1');
    tank.updateKeys({ name: 'nextWeapon', action: 'down' });
    tank.updateData(0.016);
    expect(tank.currentWeapon).toBe('w2');
  });

  it('prevWeapon циклически переключает назад', () => {
    const tank = makeMovingTank();
    tank.updateKeys({ name: 'prevWeapon', action: 'down' });
    tank.updateData(0.016);
    expect(tank.currentWeapon).toBe('w2'); // w1 -> назад -> w2 (цикл)
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
    body._pos = new Vec2(1.2345, 6.789);
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
    expect(body.setLinvel).toHaveBeenCalled();
    expect(body.gunRotation).toBe(0);
  });
});
