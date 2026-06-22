import { describe, it, expect, vi } from 'vitest';
import BaseModel from '../../src/server/parts/BaseModel.js';

// биты клавиш (упрощённый аналог config/game.js playerKeys)
const KEYS = {
  forward: 1 << 0, // 1
  back: 1 << 1, // 2
  fire: 1 << 7, // 128 (one-shot)
  nextWeapon: 1 << 8, // 256 (one-shot)
};
const ONE_SHOT_MASK = KEYS.fire | KEYS.nextWeapon;

const weapons = {
  w1: { type: 'hitscan', fireRate: 0.5, consumption: 1 },
  w2: { type: 'explosive', fireRate: 1, consumption: 2 },
};

// мок сервиса панели с внутренним состоянием значений
const makePanel = () => {
  const state = {};
  return {
    setActiveWeapon: vi.fn(),
    _set(gameId, param, value) {
      state[gameId] = state[gameId] || {};
      state[gameId][param] = value;
    },
    getCurrentValue: (gameId, param) => state[gameId]?.[param],
    hasResources: (gameId, param, value) =>
      (state[gameId]?.[param] ?? 0) >= value,
    updateUser(gameId, param, value, op) {
      state[gameId] = state[gameId] || {};
      const cur = state[gameId][param] ?? 0;
      if (op === 'set') {
        state[gameId][param] = value;
      } else if (op === 'decrement') {
        state[gameId][param] = cur - value;
      } else if (op === 'increment') {
        state[gameId][param] = cur + value;
      }
    },
  };
};

const makeModel = (panel = makePanel(), currentWeapon = 'w1') =>
  new BaseModel({
    model: 'm1',
    name: 'Alice',
    gameId: 'g1',
    teamId: 1,
    currentWeapon,
    weapons,
    playerKeys: { keys: KEYS, oneShotMask: ONE_SHOT_MASK },
    services: { panel },
  });

describe('BaseModel: конструктор', () => {
  it('устанавливает активное оружие в панели', () => {
    const panel = makePanel();
    makeModel(panel);
    expect(panel.setActiveWeapon).toHaveBeenCalledWith('g1', 'w1');
  });

  it('экспонирует геттеры', () => {
    const m = makeModel();
    expect(m.gameId).toBe('g1');
    expect(m.teamId).toBe(1);
    expect(m.name).toBe('Alice');
    expect(m.currentWeapon).toBe('w1');
    expect(m.weaponConstructorType).toBe('hitscan');
  });
});

describe('BaseModel: клавиши', () => {
  it('hold-клавиша сохраняется между тиками', () => {
    const m = makeModel();
    m.updateKeys({ name: 'forward', action: 'down' });

    expect(m.getKeysForProcessing() & KEYS.forward).toBeTruthy();
    // во втором тике всё ещё зажата
    expect(m.getKeysForProcessing() & KEYS.forward).toBeTruthy();
  });

  it('one-shot клавиша обрабатывается один раз', () => {
    const m = makeModel();
    m.updateKeys({ name: 'fire', action: 'down' });

    expect(m.getKeysForProcessing() & KEYS.fire).toBeTruthy();
    // в следующем тике одноразовое событие уже сброшено
    expect(m.getKeysForProcessing() & KEYS.fire).toBeFalsy();
  });

  it('up снимает hold-клавишу', () => {
    const m = makeModel();
    m.updateKeys({ name: 'forward', action: 'down' });
    m.updateKeys({ name: 'forward', action: 'up' });
    expect(m.getKeysForProcessing() & KEYS.forward).toBeFalsy();
  });

  it('неизвестная клавиша игнорируется', () => {
    const m = makeModel();
    m.updateKeys({ name: 'unknown', action: 'down' });
    expect(m.getKeysForProcessing()).toBe(0);
  });

  it('resetKeys сбрасывает состояние', () => {
    const m = makeModel();
    m.updateKeys({ name: 'forward', action: 'down' });
    m.resetKeys();
    expect(m.getKeysForProcessing()).toBe(0);
  });
});

describe('BaseModel: здоровье', () => {
  it('get/set через сервис панели', () => {
    const panel = makePanel();
    const m = makeModel(panel);
    m.setHealth(75);
    expect(m.getHealth()).toBe(75);
  });
});

describe('BaseModel: смена оружия', () => {
  it('вперёд переключает на следующее', () => {
    const m = makeModel();
    m.turnUserWeapon(false);
    expect(m.currentWeapon).toBe('w2');
    expect(m.weaponConstructorType).toBe('explosive');
  });

  it('зацикливается вперёд с последнего на первое', () => {
    const m = makeModel(makePanel(), 'w2');
    m.turnUserWeapon(false);
    expect(m.currentWeapon).toBe('w1');
  });

  it('назад зацикливается с первого на последнее', () => {
    const m = makeModel();
    m.turnUserWeapon(true);
    expect(m.currentWeapon).toBe('w2');
  });
});

describe('BaseModel: кулдауны и патроны', () => {
  it('выстрел списывает патроны и ставит кулдаун', () => {
    const panel = makePanel();
    panel._set('g1', 'w1', 10);
    const m = makeModel(panel);

    expect(m.tryConsumeAmmoAndShoot()).toBe(true);
    expect(panel.getCurrentValue('g1', 'w1')).toBe(9); // -consumption(1)
    // повторно нельзя — кулдаун активен
    expect(m.tryConsumeAmmoAndShoot()).toBe(false);
  });

  it('нет выстрела без патронов', () => {
    const panel = makePanel();
    panel._set('g1', 'w1', 0);
    const m = makeModel(panel);

    expect(m.tryConsumeAmmoAndShoot()).toBe(false);
  });

  it('кулдаун уменьшается со временем и снова разрешает выстрел', () => {
    const panel = makePanel();
    panel._set('g1', 'w1', 10);
    const m = makeModel(panel);

    m.tryConsumeAmmoAndShoot(); // кулдаун = fireRate (0.5)
    m.updateRemainingCooldowns(0.5); // обнуляется

    expect(m.tryConsumeAmmoAndShoot()).toBe(true);
  });

  it('кулдаун не уходит ниже 0', () => {
    const panel = makePanel();
    panel._set('g1', 'w1', 10);
    const m = makeModel(panel);

    m.tryConsumeAmmoAndShoot();
    m.updateRemainingCooldowns(999); // переуменьшение

    // следующий выстрел доступен (кулдаун зажат в 0)
    expect(m.tryConsumeAmmoAndShoot()).toBe(true);
  });
});
