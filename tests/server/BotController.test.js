import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Vec2 } from '../../src/lib/vec2.js';
import BotController from '../../src/server/modules/bots/BotController.js';

// BotController — НЕ синглтон, физику сам не создаёт (берёт game._world).
// Мокаем game/botManager/participants/panel/spatialManager.

// тело-заглушка Rapier: при нулевом угле мировые векторы = локальные
const makeBody = () => ({
  translation: () => new Vec2(0, 0),
  linvel: () => new Vec2(0, 0),
  rotation: () => 0,
  gunRotation: 0,
});

const makeGame = (overrides = {}) => ({
  _world: { castRay: vi.fn(() => null) },
  _playersData: {},
  updateKeys: vi.fn(),
  getPosition: vi.fn(),
  isAlive: vi.fn(() => true),
  ...overrides,
});

// BotManager: навигация и проверка прямой видимости
const makeBotManager = (overrides = {}) => ({
  hasLineOfSight: vi.fn(() => true),
  getRandomNavNode: vi.fn(() => new Vec2(50, 50)),
  findPath: vi.fn(() => [new Vec2(10, 10)]),
  ...overrides,
});

// ParticipantManager: поиск участников по gameId
const makeParticipants = (usersMap = {}) => {
  const map = new Map(Object.entries(usersMap));
  return { get: id => map.get(id) };
};

const botData = { gameId: 'bot1', teamId: 1 };

const makeBot = ({ game, botManager, participants, panel, spatial } = {}) => {
  const g = game || makeGame();
  const bmgr = botManager || makeBotManager();
  const pm = participants || makeParticipants();
  const p = panel || { hasResources: vi.fn(() => true) };
  const s = spatial || { queryNearby: vi.fn(() => []) };
  const bot = new BotController(bmgr, g, p, s, botData, pm);
  return { bot, game: g, botManager: bmgr, participants: pm, panel: p, spatial: s };
};

describe('BotController._setKeyState', () => {
  it('меняет состояние и шлёт команду при изменении', () => {
    const { bot, game } = makeBot();

    bot._setKeyState('forward', true);

    expect(bot._keyStates.forward).toBe(true);
    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'down',
      name: 'forward',
    });
  });

  it('не шлёт команду повторно при том же состоянии', () => {
    const { bot, game } = makeBot();

    bot._setKeyState('forward', true);
    game.updateKeys.mockClear();
    bot._setKeyState('forward', true);

    expect(game.updateKeys).not.toHaveBeenCalled();
  });

  it('отпускание клавиши шлёт action up', () => {
    const { bot, game } = makeBot();
    bot._setKeyState('left', true);
    game.updateKeys.mockClear();

    bot._setKeyState('left', false);

    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'up',
      name: 'left',
    });
  });
});

describe('BotController.releaseAllKeys', () => {
  it('сбрасывает все нажатые клавиши', () => {
    const { bot, game } = makeBot();
    bot._setKeyState('forward', true);
    bot._setKeyState('right', true);
    game.updateKeys.mockClear();

    bot.releaseAllKeys();

    expect(Object.values(bot._keyStates).every(v => v === false)).toBe(true);
    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'up',
      name: 'forward',
    });
    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'up',
      name: 'right',
    });
  });
});

describe('BotController._updateCachedData', () => {
  it('кэширует позицию и тело бота', () => {
    const body = makeBody();
    const game = makeGame({
      getPosition: vi.fn(() => [3, 4]),
      _playersData: { bot1: { getBody: () => body } },
    });
    const { bot } = makeBot({ game });

    bot._updateCachedData();

    expect(bot._myPosition).toEqual([3, 4]);
    expect(bot._myBody).toBe(body);
  });

  it('обнуляет кэш при ошибке доступа', () => {
    const game = makeGame({
      getPosition: vi.fn(() => {
        throw new Error('нет игрока');
      }),
    });
    const { bot } = makeBot({ game });

    bot._updateCachedData();

    expect(bot._myPosition).toBeNull();
    expect(bot._myBody).toBeNull();
  });
});

describe('BotController.findClosestEnemy', () => {
  it('возвращает null без своей позиции', () => {
    const { bot } = makeBot();
    expect(bot.findClosestEnemy()).toBeNull();
  });

  it('пропускает себя и союзников, выбирает ближайшего врага', () => {
    const spatial = {
      queryNearby: vi.fn(() => [
        { gameId: 'bot1', teamId: 1, x: 0, y: 0 }, // сам
        { gameId: 'ally', teamId: 1, x: 5, y: 0 }, // союзник
        { gameId: 'enemyFar', teamId: 2, x: 300, y: 0 },
        { gameId: 'enemyNear', teamId: 2, x: 100, y: 0 },
      ]),
    };
    const participants = makeParticipants({
      enemyNear: { gameId: 'enemyNear' },
      enemyFar: { gameId: 'enemyFar' },
    });
    const { bot } = makeBot({ participants, spatial });
    bot._myPosition = [0, 0];

    const enemy = bot.findClosestEnemy();
    expect(enemy).toBe(participants.get('enemyNear'));
  });

  it('игнорирует врагов за пределами дальности', () => {
    const spatial = {
      queryNearby: vi.fn(() => [
        { gameId: 'tooFar', teamId: 2, x: 1000, y: 0 }, // > порога
      ]),
    };
    const { bot } = makeBot({ spatial });
    bot._myPosition = [0, 0];

    expect(bot.findClosestEnemy()).toBeNull();
  });

  it('находит врага в едином реестре участников (включая ботов)', () => {
    const enemyBot = { gameId: 'enemyBot' };
    const spatial = {
      queryNearby: vi.fn(() => [
        { gameId: 'enemyBot', teamId: 2, x: 50, y: 0 },
      ]),
    };
    const participants = makeParticipants({ enemyBot });
    const { bot } = makeBot({ participants, spatial });
    bot._myPosition = [0, 0];

    expect(bot.findClosestEnemy()).toBe(enemyBot);
  });
});

describe('BotController.makeDecision', () => {
  it('пропускает решение, если scan-таймер не истёк и не патрулирование', () => {
    const { bot } = makeBot();
    bot.state = 'ATTACKING';
    bot._targetScanTimer = 5;
    bot.findClosestEnemy = vi.fn();

    bot.makeDecision();

    expect(bot.findClosestEnemy).not.toHaveBeenCalled();
    expect(bot.state).toBe('ATTACKING');
  });

  it('видимый враг → ATTACKING', () => {
    const game = makeGame({ getPosition: vi.fn(() => [100, 0]) });
    const botManager = makeBotManager({ hasLineOfSight: vi.fn(() => true) });
    const { bot } = makeBot({ game, botManager });
    bot._myPosition = [0, 0];
    bot._targetScanTimer = 0;
    bot.findClosestEnemy = vi.fn(() => ({ gameId: 'e1' }));

    bot.makeDecision();

    expect(bot.state).toBe('ATTACKING');
  });

  it('невидимый враг → NAVIGATING', () => {
    const game = makeGame({ getPosition: vi.fn(() => [100, 0]) });
    const botManager = makeBotManager({ hasLineOfSight: vi.fn(() => false) });
    const { bot } = makeBot({ game, botManager });
    bot._myPosition = [0, 0];
    bot._targetScanTimer = 0;
    bot.findClosestEnemy = vi.fn(() => ({ gameId: 'e1' }));

    bot.makeDecision();

    expect(bot.state).toBe('NAVIGATING');
  });

  it('нет врага, но есть последняя позиция → SEARCHING', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot._targetScanTimer = 0;
    bot.findClosestEnemy = vi.fn(() => null);
    bot._lastKnownPosition = new Vec2(10, 10);

    bot.makeDecision();

    expect(bot.state).toBe('SEARCHING');
  });

  it('нет врага и позиции → PATROLLING и новая цель патруля', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot._targetScanTimer = 0;
    bot.findClosestEnemy = vi.fn(() => null);
    bot._lastKnownPosition = null;
    bot.setNewPatrolTarget = vi.fn();

    bot.makeDecision();

    expect(bot.state).toBe('PATROLLING');
    expect(bot.setNewPatrolTarget).toHaveBeenCalled();
  });
});

describe('BotController.moveTo', () => {
  it('без тела ничего не делает', () => {
    const { bot, game } = makeBot();
    bot._myBody = null;

    bot.moveTo(new Vec2(100, 0), true);

    expect(game.updateKeys).not.toHaveBeenCalled();
  });

  it('к далёкой точке прямо по курсу — едет вперёд', () => {
    const { bot } = makeBot();
    bot._myBody = makeBody();
    bot._myPosition = [0, 0];

    bot.moveTo(new Vec2(100, 0), true);

    expect(bot._keyStates.forward).toBe(true);
    expect(bot._keyStates.left).toBe(false);
    expect(bot._keyStates.right).toBe(false);
  });

  it('к точке сбоку — поворачивает направо', () => {
    const { bot } = makeBot();
    bot._myBody = makeBody();
    bot._myPosition = [0, 0];

    bot.moveTo(new Vec2(0, 100), true);

    expect(bot._keyStates.right).toBe(true);
    expect(bot._keyStates.left).toBe(false);
  });

  it('у самой цели — останавливается', () => {
    const { bot } = makeBot();
    bot._myBody = makeBody();
    bot._myPosition = [0, 0];
    bot._setKeyState('forward', true);

    bot.moveTo(new Vec2(5, 0), true); // ближе MIN_TARGET_DISTANCE (30)

    expect(bot._keyStates.forward).toBe(false);
  });
});

describe('BotController.calculateNewCombatPosition', () => {
  it('без позиции/тела не задаёт цель перемещения', () => {
    const { bot } = makeBot();
    bot._myPosition = null;
    bot._myBody = null;

    bot.calculateNewCombatPosition();

    expect(bot._repositionTarget).toBeNull();
  });

  it('задаёт точку стрейфа сбоку от бота', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot._myBody = makeBody(); // rightVec = (0, 1)

    bot.calculateNewCombatPosition();

    expect(bot._repositionTarget).not.toBeNull();
    expect(bot._repositionTarget.x).toBe(0);
    expect(Math.abs(bot._repositionTarget.y)).toBeGreaterThanOrEqual(100);
  });
});

describe('BotController.update: ветка DEAD', () => {
  it('переходит в DEAD и отпускает клавиши без тела', () => {
    const { bot, game } = makeBot(); // _playersData пуст → нет тела
    bot._setKeyState('forward', true);
    game.updateKeys.mockClear();

    bot.update(0.1);

    expect(bot.state).toBe('DEAD');
    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'up',
      name: 'forward',
    });
  });

  it('повторный update в DEAD не дёргает клавиши заново', () => {
    const { bot, game } = makeBot();
    bot.update(0.1); // → DEAD
    game.updateKeys.mockClear();

    bot.update(0.1);

    expect(game.updateKeys).not.toHaveBeenCalled();
  });
});

describe('BotController.destroy', () => {
  it('сбрасывает цель и помечает бота как DEAD', () => {
    const { bot } = makeBot();
    bot._target = { gameId: 'e1' };

    bot.destroy();

    expect(bot._target).toBeNull();
    expect(bot.state).toBe('DEAD');
  });
});

describe('BotController.setNewPatrolTarget', () => {
  it('строит путь к случайной нав-точке', () => {
    const node = new Vec2(50, 50);
    const path = [new Vec2(10, 10)];
    const botManager = makeBotManager({
      getRandomNavNode: vi.fn(() => node),
      findPath: vi.fn(() => path),
    });
    const { bot } = makeBot({ botManager });
    bot._myPosition = [0, 0];

    bot.setNewPatrolTarget();

    expect(bot._patrolTarget).toBe(node);
    expect(bot._path).toBe(path);
    expect(bot._pathIndex).toBe(0);
    expect(botManager.findPath).toHaveBeenCalled();
  });

  it('ничего не делает без нав-точки', () => {
    const botManager = makeBotManager({ getRandomNavNode: vi.fn(() => null) });
    const { bot } = makeBot({ botManager });
    bot._myPosition = [0, 0];

    bot.setNewPatrolTarget();

    expect(bot._patrolTarget).toBeNull();
    expect(botManager.findPath).not.toHaveBeenCalled();
  });
});

describe('BotController.followPath', () => {
  it('двигается к текущей точке пути', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot._path = [new Vec2(100, 0)];
    bot._pathIndex = 0;
    bot.moveTo = vi.fn();

    bot.followPath();

    expect(bot.moveTo).toHaveBeenCalledWith(bot._path[0], true);
    expect(bot._pathIndex).toBe(0); // ещё далеко
  });

  it('переключается на следующую точку при достижении', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot._path = [new Vec2(5, 0)]; // ближе MIN_TARGET_DISTANCE
    bot._pathIndex = 0;
    bot.moveTo = vi.fn();

    bot.followPath();

    expect(bot._pathIndex).toBe(1);
  });

  it('ничего не делает без пути', () => {
    const { bot } = makeBot();
    bot._path = null;
    bot.moveTo = vi.fn();

    bot.followPath();

    expect(bot.moveTo).not.toHaveBeenCalled();
  });
});

describe('BotController.avoidObstacles', () => {
  it('без препятствий возвращает желаемое направление', () => {
    const { bot } = makeBot(); // castRay возвращает null
    const body = makeBody();
    const desired = new Vec2(1, 0);

    expect(bot.avoidObstacles(body, desired)).toBe(desired);
  });

  it('статичное препятствие корректирует курс (нормализованный вектор)', () => {
    const game = makeGame();
    // любой луч попадает в статичное препятствие
    game._world.castRay = vi.fn(() => ({ collider: {}, timeOfImpact: 0.5 }));
    const { bot } = makeBot({ game });
    const body = makeBody();

    const result = bot.avoidObstacles(body, new Vec2(1, 0));

    // курс развёрнут от препятствия и нормализован
    expect(result.x).toBeCloseTo(-1);
    expect(result.length()).toBeCloseTo(1);
  });

  it('только динамическое препятствие (map_object) не меняет курс (таран)', () => {
    const game = makeGame();
    // map_object исключается предикатом → луч «не попадает»
    game._world.castRay = vi.fn(
      (ray, maxToi, solid, flags, groups, exCollider, exBody, predicate) => {
        const passed = predicate({
          parent: () => ({ userData: { type: 'map_object' } }),
        });

        return passed ? { collider: {}, timeOfImpact: 0.5 } : null;
      },
    );
    const { bot } = makeBot({ game });
    const body = makeBody();
    const desired = new Vec2(1, 0);

    expect(bot.avoidObstacles(body, desired)).toBe(desired);
  });
});

describe('BotController.executeMovement', () => {
  it('мёртвая цель сбрасывается и инициирует пересчёт решения', () => {
    const game = makeGame({ isAlive: vi.fn(() => false) });
    const { bot } = makeBot({ game });
    bot._myPosition = [0, 0];
    bot._target = { gameId: 'e1' };
    bot.makeDecision = vi.fn();

    bot.executeMovement();

    expect(bot._target).toBeNull();
    expect(bot.makeDecision).toHaveBeenCalled();
  });

  it('ATTACKING без репозиции едет к цели', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'ATTACKING';
    bot._target = { gameId: 'e1' };
    bot.moveTo = vi.fn();

    bot.executeMovement();

    expect(bot.moveTo).toHaveBeenCalledWith('e1');
  });

  it('ATTACKING с активной репозицией едет к точке стрейфа', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'ATTACKING';
    bot._target = { gameId: 'e1' };
    bot._repositionTimer = 1;
    bot._repositionTarget = new Vec2(500, 0);
    bot.moveTo = vi.fn();

    bot.executeMovement();

    expect(bot.moveTo).toHaveBeenCalledWith(bot._repositionTarget, true);
  });

  it('SEARCHING едет к последней известной позиции', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'SEARCHING';
    bot._lastKnownPosition = new Vec2(300, 0);
    bot.moveTo = vi.fn();

    bot.executeMovement();

    expect(bot.moveTo).toHaveBeenCalledWith(bot._lastKnownPosition, true);
  });

  it('PATROLLING с путём идёт по пути', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'PATROLLING';
    bot._path = [new Vec2(300, 0)];
    bot._patrolTarget = new Vec2(300, 0);
    bot.followPath = vi.fn();

    bot.executeMovement();

    expect(bot.followPath).toHaveBeenCalled();
  });

  it('PATROLLING без пути запрашивает новую цель', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'PATROLLING';
    bot._path = null;
    bot.setNewPatrolTarget = vi.fn();

    bot.executeMovement();

    expect(bot.setNewPatrolTarget).toHaveBeenCalled();
  });

  it('в прочих состояниях отпускает клавиши', () => {
    const { bot } = makeBot();
    bot._myPosition = [0, 0];
    bot.state = 'IDLE';
    bot.releaseAllKeys = vi.fn();

    bot.executeMovement();

    expect(bot.releaseAllKeys).toHaveBeenCalled();
  });
});

describe('BotController.handleClearingObstacle', () => {
  it('без тела переходит в IDLE', () => {
    const { bot } = makeBot();
    bot._myBody = null;

    bot.handleClearingObstacle();

    expect(bot.state).toBe('IDLE');
  });

  it('при выровненной башне стреляет и возвращается к патрулю', () => {
    const { bot, game } = makeBot();
    bot._myBody = makeBody(); // angle 0, gunRotation 0 → выровнено

    bot.handleClearingObstacle();

    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'down',
      name: 'fire',
    });
    expect(bot.state).toBe('PATROLLING');
  });

  it('при отклонённой башне доворачивает её', () => {
    const { bot } = makeBot();
    const body = makeBody();
    body.gunRotation = -0.5; // diff = 0 - (-0.5) = 0.5 > порога
    bot._myBody = body;

    bot.handleClearingObstacle();

    expect(bot._keyStates.gunRight).toBe(true);
  });
});

describe('BotController.executeAimAndShoot: ранний выход и смена оружия', () => {
  const attackingBot = (currentWeapon, target) => {
    const game = makeGame({
      getPosition: vi.fn(() => [target[0], target[1]]),
      _playersData: { bot1: { currentWeapon } },
    });
    const { bot, ...rest } = makeBot({ game });
    bot.state = 'ATTACKING';
    bot._target = { gameId: 'e1' };
    bot._myBody = makeBody();
    bot._repositionTimer = 0;
    return { bot, game, ...rest };
  };

  it('вне состояния ATTACKING не стреляет', () => {
    const { bot, game } = makeBot();
    bot.state = 'PATROLLING';
    bot._target = null;

    bot.executeAimAndShoot();

    expect(game.updateKeys).not.toHaveBeenCalledWith('bot1', {
      action: 'down',
      name: 'fire',
    });
  });

  it('вблизи врага переключается на бомбу (w1 → nextWeapon)', () => {
    const { bot, game } = attackingBot('w1', [50, 0]); // distSq 2500 < 100^2

    bot.executeAimAndShoot();

    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'down',
      name: 'nextWeapon',
    });
  });

  it('вдали от врага переключается обратно с бомбы (w2 → nextWeapon)', () => {
    const { bot, game } = attackingBot('w2', [200, 0]); // distSq 40000 > 100^2

    bot.executeAimAndShoot();

    expect(game.updateKeys).toHaveBeenCalledWith('bot1', {
      action: 'down',
      name: 'nextWeapon',
    });
  });
});
