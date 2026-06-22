import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vec2 } from 'planck';

let HitscanService;

// фикстура-помощник
const makeFixture = ({ sensor = false, userData = null, dynamic = true } = {}) => {
  const body = {
    getUserData: () => userData,
    isDynamic: () => dynamic,
    applyLinearImpulse: vi.fn(),
  };
  return {
    isSensor: () => sensor,
    getBody: () => body,
    _body: body,
  };
};

// мир, чей rayCast проигрывает заранее заданные пересечения
const makeWorld = hits => ({
  _returns: [],
  rayCast(start, end, callback) {
    for (const hit of hits) {
      const point = Vec2(hit.point.x, hit.point.y);
      const ret = callback(hit.fixture, point, Vec2(0, 1), hit.fraction);
      this._returns.push(ret);
    }
  },
});

const baseParams = () => ({
  gameId: 'shooter',
  weaponName: 'w1',
  startPoint: Vec2(0, 0),
  direction: Vec2(1, 0),
  bodyPosition: { x: 0, y: 0 },
});

beforeEach(async () => {
  vi.resetModules();
  HitscanService = (await import('../../src/server/parts/HitscanService.js')).default;
});

describe('HitscanService.processShot', () => {
  it('без попаданий возвращает конечную точку луча и wasHit=false', () => {
    const world = makeWorld([]); // rayCast никого не задел
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    const result = hs.processShot(baseParams());

    // [startX, startY, endX, endY, bodyX, bodyY, wasHit]
    expect(result[6]).toBe(false);
    expect(result[2]).toBe(100); // конец луча: start(0) + dir(1)*range(100)
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('попадание в игрока наносит урон', () => {
    const fixture = makeFixture({
      userData: { type: 'player', gameId: 'victim' },
    });
    const world = makeWorld([{ fixture, point: { x: 50, y: 0 }, fraction: 0.5 }]);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    const result = hs.processShot(baseParams());

    expect(result[6]).toBe(true);
    expect(result[2]).toBe(50); // точка попадания
    expect(game.applyDamage).toHaveBeenCalledWith('victim', 'shooter', 'w1');
  });

  it('применяет импульс к динамическому телу', () => {
    const fixture = makeFixture({ userData: { type: 'wall' }, dynamic: true });
    const world = makeWorld([{ fixture, point: { x: 20, y: 0 }, fraction: 0.2 }]);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100, impulseMagnitude: 5 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot(baseParams());

    expect(fixture._body.applyLinearImpulse).toHaveBeenCalled();
    // не игрок → урон не наносится
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('сенсорные фикстуры игнорируются (callback возвращает -1)', () => {
    const sensor = makeFixture({ sensor: true });
    const world = makeWorld([{ fixture: sensor, point: { x: 10, y: 0 }, fraction: 0.1 }]);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    const result = hs.processShot(baseParams());

    expect(world._returns[0]).toBe(-1.0); // луч продолжается сквозь сенсор
    expect(result[6]).toBe(false); // попадания нет
  });

  it('не применяет импульс к статике', () => {
    const fixture = makeFixture({ userData: { type: 'wall' }, dynamic: false });
    const world = makeWorld([{ fixture, point: { x: 30, y: 0 }, fraction: 0.3 }]);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100, impulseMagnitude: 5 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot(baseParams());

    expect(fixture._body.applyLinearImpulse).not.toHaveBeenCalled();
  });
});
