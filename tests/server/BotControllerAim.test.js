import { describe, it, expect, vi } from 'vitest';
import { Vec2 } from 'planck';

// Прицеливание использует randomRange для разброса. Обнуляем его, чтобы
// угол был детерминированным (иначе бот может «промахнуться» и не выстрелить).
// Вынесено в отдельный файл, чтобы не влиять на calculateNewCombatPosition.
vi.mock('../../src/lib/math.js', async orig => ({
  ...(await orig()),
  randomRange: () => 0,
}));

const { default: BotController } = await import(
  '../../src/server/modules/bots/BotController.js'
);

const makeBody = () => ({
  getPosition: () => new Vec2(0, 0),
  getWorldVector: v => v,
  getLinearVelocity: () => new Vec2(0, 0),
  getAngle: () => 0,
  gunRotation: 0,
});

const botData = { gameId: 'bot1', teamId: 1 };

// бот в состоянии ATTACKING с целью и телом
const attackingBot = (currentWeapon, target) => {
  const game = {
    _world: { rayCast: vi.fn() },
    _playersData: { bot1: { currentWeapon } },
    updateKeys: vi.fn(),
    getPosition: vi.fn(() => [target[0], target[1]]),
    isAlive: vi.fn(() => true),
  };
  const vimp = { _users: {}, _bots: { hasLineOfSight: vi.fn(() => true) } };
  const panel = { hasResources: vi.fn(() => true) };
  const bot = new BotController(vimp, game, panel, { queryNearby: () => [] }, botData);
  bot.state = 'ATTACKING';
  bot._target = { gameId: 'e1' };
  bot._myBody = makeBody();
  bot._myPosition = [0, 0];
  bot._repositionTimer = 0;
  bot._firingTimer = 0;
  return { bot, game, panel };
};

const firedWith = (game, name) =>
  game.updateKeys.mock.calls.some(
    ([id, data]) => data.action === 'down' && data.name === name,
  );

describe('BotController.executeAimAndShoot: прицеливание и огонь', () => {
  it('выровненный прицел по w1 в зоне поражения — стреляет и репозиционируется', () => {
    const { bot, game } = attackingBot('w1', [200, 0]); // прямо по курсу, в дальности

    bot.executeAimAndShoot();

    expect(firedWith(game, 'fire')).toBe(true);
    expect(bot._repositionTimer).toBe(2.0);
  });

  it('цель сбоку — доворачивает башню, не стреляет', () => {
    const { bot, game } = attackingBot('w1', [0, 200]); // угол ~90°

    bot.executeAimAndShoot();

    expect(bot._keyStates.gunRight).toBe(true);
    expect(firedWith(game, 'fire')).toBe(false);
  });

  it('вблизи с бомбой (w2) — стреляет и ставит кулдаун бомбы', () => {
    const { bot, game } = attackingBot('w2', [50, 0]); // distSq 2500 < 100^2

    bot.executeAimAndShoot();

    expect(firedWith(game, 'fire')).toBe(true);
    expect(bot._repositionTimer).toBe(2.0);
  });

  it('без боезапаса не стреляет', () => {
    const { bot, game, panel } = attackingBot('w1', [200, 0]);
    panel.hasResources = vi.fn(() => false);

    bot.executeAimAndShoot();

    expect(firedWith(game, 'fire')).toBe(false);
  });
});
