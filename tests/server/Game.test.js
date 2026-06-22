import { describe, it, expect, beforeEach, vi } from 'vitest';

// Game — синглтон и тянет planck-мир; перезагружаем модуль для изоляции.
// Тестируем изолированную логику (урон, команды), внедряя фейковых
// игроков напрямую в _playersData, не создавая реальные танки.
let Game;

const parts = {
  models: { m1: { constructor: 'Tank', currentWeapon: 'w1' } },
  weapons: {
    w1: { type: 'hitscan', damage: 40, cameraShake: { intensity: 1 } },
    w2: { type: 'explosive', damage: 70, shotOutcomeId: 'w2e' },
  },
  mapConstructor: 'Map',
  hitscanService: 'HitscanService',
  friendlyFire: false,
};

const playerKeys = {
  forward: { key: 1 },
  fire: { key: 128, type: 1 },
  nextWeapon: { key: 256, type: 1 },
};

const fakePlayer = ({ teamId, alive = true, destroyed = false }) => ({
  teamId,
  model: 'm1',
  _alive: alive,
  isAlive() {
    return this._alive;
  },
  takeDamage: vi.fn(() => destroyed),
  getPosition: () => [1, 2],
});

const makeGame = () => {
  const game = new Game(parts, playerKeys, 1 / 120);
  game._services.vimp = {
    triggerCameraShake: vi.fn(),
    reportKill: vi.fn(),
  };
  return game;
};

beforeEach(async () => {
  vi.resetModules();
  Game = (await import('../../src/server/modules/Game.js')).default;
});

describe('Game: конструктор', () => {
  it('строит карту клавиш и oneShotMask', () => {
    const game = makeGame();
    expect(game._playerKeys.keys.fire).toBe(128);
    // fire и nextWeapon — одноразовые (type: 1)
    expect(game._playerKeys.oneShotMask & 128).toBeTruthy();
    expect(game._playerKeys.oneShotMask & 256).toBeTruthy();
    // forward не одноразовая
    expect(game._playerKeys.oneShotMask & 1).toBeFalsy();
  });

  it('отбирает только hitscan-оружие в _hitscanWeapons', () => {
    const game = makeGame();
    expect(game._hitscanWeapons).toHaveProperty('w1');
    expect(game._hitscanWeapons).not.toHaveProperty('w2');
  });
});

describe('Game.applyDamage', () => {
  let game;

  beforeEach(() => {
    game = makeGame();
    game._playersData = {
      victim: fakePlayer({ teamId: 2 }),
      shooter: fakePlayer({ teamId: 1 }),
    };
  });

  it('наносит урон врагу из конфига оружия', () => {
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._playersData.victim.takeDamage).toHaveBeenCalledWith(40);
  });

  it('использует явный damageValue, если передан', () => {
    game.applyDamage('victim', 'shooter', 'w1', 12);
    expect(game._playersData.victim.takeDamage).toHaveBeenCalledWith(12);
  });

  it('триггерит тряску камеры цели', () => {
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._services.vimp.triggerCameraShake).toHaveBeenCalledWith(
      'victim',
      { intensity: 1 },
    );
  });

  it('не бьёт союзника при выключенном friendlyFire', () => {
    game._playersData.shooter.teamId = 2; // та же команда, что и victim
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._playersData.victim.takeDamage).not.toHaveBeenCalled();
  });

  it('бьёт союзника при включённом friendlyFire', () => {
    game._friendlyFire = true;
    game._playersData.shooter.teamId = 2;
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._playersData.victim.takeDamage).toHaveBeenCalled();
  });

  it('игнорирует урон уже уничтоженной цели', () => {
    game._playersData.victim._alive = false;
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._playersData.victim.takeDamage).not.toHaveBeenCalled();
  });

  it('сообщает об убийстве, если цель уничтожена этим уроном', () => {
    game._playersData.victim = fakePlayer({ teamId: 2, destroyed: true });
    game.applyDamage('victim', 'shooter', 'w1');
    expect(game._services.vimp.reportKill).toHaveBeenCalledWith(
      'victim',
      'shooter',
    );
  });
});

describe('Game: состояние игроков', () => {
  it('isAlive отражает состояние и отсутствие игрока', () => {
    const game = makeGame();
    game._playersData = { p1: fakePlayer({ teamId: 1 }) };

    expect(game.isAlive('p1')).toBe(true);
    expect(game.isAlive('ghost')).toBe(false);

    game._playersData.p1._alive = false;
    expect(game.isAlive('p1')).toBe(false);
  });

  it('getAlivePlayers возвращает только живых с координатами', () => {
    const game = makeGame();
    game._playersData = {
      alive: fakePlayer({ teamId: 1, alive: true }),
      dead: fakePlayer({ teamId: 2, alive: false }),
    };

    const result = game.getAlivePlayers();
    expect(result).toEqual([{ gameId: 'alive', teamId: 1, x: 1, y: 2 }]);
  });
});
