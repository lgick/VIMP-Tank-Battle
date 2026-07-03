import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vec2 } from '../../src/lib/vec2.js';
import RAPIER from '../../src/server/physics/rapier.js';

let HitscanService;

// тело-помощник (Rapier RigidBody)
const makeBody = ({ userData = null, dynamic = true } = {}) => ({
  userData,
  isDynamic: () => dynamic,
  applyImpulseAtPoint: vi.fn(),
});

// мир, чей castRay возвращает заранее заданное попадание
// (Ray реальный — pointAt считается кодом сервиса)
const makeWorld = hit => ({
  lastCastArgs: null,
  castRay(ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody) {
    this.lastCastArgs = { ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody };

    if (!hit) {
      return null;
    }

    return {
      collider: { parent: () => hit.body },
      timeOfImpact: hit.timeOfImpact,
    };
  },
});

const baseParams = () => ({
  gameId: '4', // gameId в реестре — числовая строка
  weaponName: 'w1',
  startPoint: new Vec2(0, 0),
  direction: new Vec2(1, 0),
  bodyPosition: { x: 0, y: 0 },
});

beforeEach(async () => {
  vi.resetModules();
  HitscanService = (await import('../../src/server/parts/HitscanService.js'))
    .default;
});

describe('HitscanService.processShot', () => {
  it('без попаданий возвращает конечную точку луча и wasHit=false', () => {
    const world = makeWorld(null); // castRay никого не задел
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    const result = hs.processShot(baseParams());

    // [startX, startY, endX, endY, bodyX, bodyY, wasHit, shooterId]
    expect(result[6]).toBe(false);
    expect(result[2]).toBe(100); // конец луча: start(0) + dir(1)*range(100)
    expect(result[7]).toBe(4); // shooterId — числом (для подавления дубля)
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('попадание в игрока наносит урон', () => {
    const body = makeBody({ userData: { type: 'player', gameId: 'victim' } });
    // toi 0.5 при длине луча range=100 → точка попадания x=50
    const world = makeWorld({ body, timeOfImpact: 0.5 });
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    const result = hs.processShot(baseParams());

    expect(result[6]).toBe(true);
    expect(result[2]).toBe(50); // точка попадания
    expect(game.applyDamage).toHaveBeenCalledWith('victim', '4', 'w1');
  });

  it('применяет импульс к динамическому телу', () => {
    const body = makeBody({ userData: { type: 'wall' }, dynamic: true });
    const world = makeWorld({ body, timeOfImpact: 0.2 });
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100, impulseMagnitude: 5 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot(baseParams());

    expect(body.applyImpulseAtPoint).toHaveBeenCalled();
    // не игрок → урон не наносится
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('сенсоры исключаются флагом запроса EXCLUDE_SENSORS', () => {
    const world = makeWorld(null);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot(baseParams());

    expect(world.lastCastArgs.filterFlags).toBe(
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    expect(world.lastCastArgs.maxToi).toBe(1.0); // длина задана вектором луча
  });

  it('не применяет импульс к статике', () => {
    const body = makeBody({ userData: { type: 'wall' }, dynamic: false });
    const world = makeWorld({ body, timeOfImpact: 0.3 });
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100, impulseMagnitude: 5 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot(baseParams());

    expect(body.applyImpulseAtPoint).not.toHaveBeenCalled();
  });

  it('тело стреляющего передаётся как filterExcludeRigidBody', () => {
    const shooterBody = makeBody();
    const world = makeWorld(null);
    const game = { applyDamage: vi.fn() };
    const weapons = { w1: { range: 100 } };

    const hs = new HitscanService({ world, weapons, game });
    hs.processShot({ ...baseParams(), shooterBody });

    expect(world.lastCastArgs.filterExcludeRigidBody).toBe(shooterBody);
  });
});
