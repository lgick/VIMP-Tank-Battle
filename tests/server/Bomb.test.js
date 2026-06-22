import { describe, it, expect, vi } from 'vitest';
import { Vec2 } from 'planck';
import Bomb from '../../src/server/parts/Bomb.js';

// фейковое физическое тело
const makeBody = ({ position, userData = null, dynamic = true }) => ({
  _pos: Vec2(position.x, position.y),
  _userData: userData,
  getPosition() {
    return this._pos;
  },
  getUserData() {
    return this._userData;
  },
  setUserData(d) {
    this._userData = d;
  },
  isDynamic() {
    return dynamic;
  },
  getAngle() {
    return 0;
  },
  createFixture: vi.fn(),
  applyLinearImpulse: vi.fn(),
});

// фейковый мир: создаёт тело бомбы и проигрывает цели через queryAABB
const makeWorld = targets => ({
  bombBody: null,
  createBody(opts) {
    const body = makeBody({
      position: opts.position,
      dynamic: opts.type === 'dynamic',
    });
    this.bombBody = body;
    return body;
  },
  // строковый ключ: имя из API planck, его нельзя переименовать,
  // а eslint-правило no-consecutive-caps не трогает строковые литералы
  ['queryAABB'](_aabb, cb) {
    for (const t of targets) {
      cb({ getBody: () => t });
    }
  },
});

const weaponData = {
  size: 8,
  radius: 50,
  damage: 70,
  impulseMagnitude: 2000,
  time: 300,
};

const makeBomb = (world, position = Vec2(0, 0)) =>
  new Bomb({
    weaponData,
    world,
    position,
    userData: { gameId: 'shooter', teamId: 1, weaponName: 'w2' },
  });

describe('Bomb.detonate: урон', () => {
  it('наносит урон врагу в радиусе с учётом падения по расстоянию', () => {
    const enemy = makeBody({
      position: { x: 10, y: 0 },
      userData: { type: 'player', gameId: 'enemy', teamId: 2 },
    });
    const world = makeWorld([enemy]);
    const game = { applyDamage: vi.fn() };

    const bomb = makeBomb(world);
    bomb.detonate(world, game, false);

    // distance=10, falloff=1-10/50=0.8, damage=round(70*0.8)=56
    expect(game.applyDamage).toHaveBeenCalledWith('enemy', 'shooter', 'w2', 56);
  });

  it('не задевает цель за пределами радиуса', () => {
    const far = makeBody({
      position: { x: 100, y: 0 }, // distance 100 > radius 50
      userData: { type: 'player', gameId: 'far', teamId: 2 },
    });
    const world = makeWorld([far]);
    const game = { applyDamage: vi.fn() };

    makeBomb(world).detonate(world, game, false);
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('по умолчанию не бьёт союзника (friendlyFire выключен)', () => {
    const mate = makeBody({
      position: { x: 10, y: 0 },
      userData: { type: 'player', gameId: 'mate', teamId: 1 },
    });
    const world = makeWorld([mate]);
    const game = { applyDamage: vi.fn() };

    makeBomb(world).detonate(world, game, false);
    expect(game.applyDamage).not.toHaveBeenCalled();
  });

  it('с friendlyFire бьёт союзника', () => {
    const mate = makeBody({
      position: { x: 10, y: 0 },
      userData: { type: 'player', gameId: 'mate', teamId: 1 },
    });
    const world = makeWorld([mate]);
    const game = { applyDamage: vi.fn() };

    makeBomb(world).detonate(world, game, true);
    expect(game.applyDamage).toHaveBeenCalledWith('mate', 'shooter', 'w2', 56);
  });

  it('пропускает тела без userData и статические', () => {
    const noData = makeBody({ position: { x: 5, y: 0 }, userData: null });
    const staticBody = makeBody({
      position: { x: 5, y: 0 },
      userData: { type: 'player', gameId: 'x', teamId: 2 },
      dynamic: false,
    });
    const world = makeWorld([noData, staticBody]);
    const game = { applyDamage: vi.fn() };

    makeBomb(world).detonate(world, game, false);
    expect(game.applyDamage).not.toHaveBeenCalled();
  });
});

describe('Bomb.detonate: импульс', () => {
  it('применяет импульс к динамической цели', () => {
    const enemy = makeBody({
      position: { x: 10, y: 0 },
      userData: { type: 'player', gameId: 'enemy', teamId: 2 },
    });
    const world = makeWorld([enemy]);
    const game = { applyDamage: vi.fn() };

    makeBomb(world).detonate(world, game, false);
    expect(enemy.applyLinearImpulse).toHaveBeenCalled();
  });
});

describe('Bomb: данные для клиента', () => {
  it('detonate возвращает позицию и радиус взрыва', () => {
    const world = makeWorld([]);
    const game = { applyDamage: vi.fn() };

    const data = makeBomb(world, Vec2(3, 4)).detonate(world, game, false);
    expect(data).toEqual([3, 4, 50]);
  });

  it('getData возвращает позицию, угол, размер и время', () => {
    const world = makeWorld([]);
    const bomb = makeBomb(world, Vec2(1.5, 2.5));

    expect(bomb.getData()).toEqual([1.5, 2.5, 0, 8, 300]);
  });
});
