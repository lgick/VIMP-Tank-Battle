import { describe, it, expect, beforeEach, vi } from 'vitest';

// BotController создаёт физику — мокаем его заглушкой
vi.mock('../../src/server/modules/bots/BotController.js', () => ({
  default: class {
    update() {}
    destroy() {}
  },
}));

let BotManager;

// фейковый VIMP с минимально необходимым состоянием
const makeVimp = (overrides = {}) => ({
  _teams: { team1: 1, team2: 2, spectators: 3 },
  _spectatorTeam: 'spectators',
  _users: {},
  _maxPlayers: 30,
  _teamSizes: { team1: new Set(), team2: new Set() },
  checkName: name => name,
  ...overrides,
});

const makeDeps = () => ({
  game: { removePlayer: vi.fn() },
  panel: { addUser: vi.fn(), removeUser: vi.fn() },
  stat: { addUser: vi.fn(), removeUser: vi.fn() },
});

// карта с респаунами (по 2 слота на команду)
const mapData = (slots = 2) => ({
  respawns: {
    team1: Array.from({ length: slots }, (_, i) => [i, i]),
    team2: Array.from({ length: slots }, (_, i) => [i, i]),
  },
});

beforeEach(async () => {
  vi.resetModules();
  BotManager = (await import('../../src/server/modules/bots/BotManager.js'))
    .default;
});

describe('BotManager.createBots', () => {
  it('возвращает 0 без данных карты (нет респаунов)', () => {
    const vimp = makeVimp();
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);

    expect(bm.createBots(2)).toBe(0);
  });

  it('создаёт ботов в указанной команде и регистрирует их', () => {
    const vimp = makeVimp();
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);
    bm.createMap(mapData());

    const created = bm.createBots(2, 'team1');

    expect(created).toBe(2);
    expect(bm.getBotCount()).toBe(2);
    expect(bm.getBotCountForTeam('team1')).toBe(2);
    expect(stat.addUser).toHaveBeenCalledTimes(2);
    expect(panel.addUser).toHaveBeenCalledTimes(2);
    expect(vimp._teamSizes.team1.size).toBe(2);
  });

  it('не превышает вместимость респаунов команды', () => {
    const vimp = makeVimp();
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);
    bm.createMap(mapData(2)); // только 2 слота

    expect(bm.createBots(5, 'team1')).toBe(2);
  });

  it('распределяет ботов в наименьшую команду без указания team', () => {
    const vimp = makeVimp();
    vimp._teamSizes.team1.add('player'); // team1 уже занятее
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);
    bm.createMap(mapData());

    bm.createBots(1); // без команды → в team2

    expect(bm.getBotCountForTeam('team2')).toBe(1);
  });

  it('соблюдает глобальный лимит игроков', () => {
    const vimp = makeVimp({ _maxPlayers: 1 });
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);
    bm.createMap(mapData());

    expect(bm.createBots(5, 'team1')).toBe(1);
  });

  it('генерирует уникальные gameId с префиксом _', () => {
    const vimp = makeVimp();
    const { game, panel, stat } = makeDeps();
    const bm = new BotManager(vimp, game, panel, stat);
    bm.createMap(mapData());

    bm.createBots(2, 'team1');
    const ids = [...bm.getBots()].map(b => b.gameId).sort();
    expect(ids).toEqual(['_0', '_1']);
  });
});

describe('BotManager.removeBots', () => {
  let bm, vimp, deps;

  beforeEach(() => {
    vimp = makeVimp();
    deps = makeDeps();
    bm = new BotManager(vimp, deps.game, deps.panel, deps.stat);
    bm.createMap(mapData());
    bm.createBots(2, 'team1');
    bm.createBots(1, 'team2');
  });

  it('удаляет ботов только указанной команды', () => {
    bm.removeBots('team1');

    expect(bm.getBotCountForTeam('team1')).toBe(0);
    expect(bm.getBotCountForTeam('team2')).toBe(1);
    expect(deps.game.removePlayer).toHaveBeenCalledTimes(2);
  });

  it('без аргумента удаляет всех ботов', () => {
    bm.removeBots();
    expect(bm.getBotCount()).toBe(0);
    expect(deps.stat.removeUser).toHaveBeenCalledTimes(3);
  });

  it('removeOneBotForPlayer освобождает место и возвращает true', () => {
    expect(bm.removeOneBotForPlayer('team1')).toBe(true);
    expect(bm.getBotCountForTeam('team1')).toBe(1);
  });

  it('removeOneBotForPlayer возвращает false, если ботов нет', () => {
    bm.removeBots();
    expect(bm.removeOneBotForPlayer('team1')).toBe(false);
  });
});

describe('BotManager: подсчёты', () => {
  it('getBotCountsPerTeam считает ботов по командам', () => {
    const vimp = makeVimp();
    const deps = makeDeps();
    const bm = new BotManager(vimp, deps.game, deps.panel, deps.stat);
    bm.createMap(mapData());
    bm.createBots(2, 'team1');
    bm.createBots(1, 'team2');

    expect(bm.getBotCountsPerTeam()).toEqual({ team1: 2, team2: 1 });
  });

  it('getBotById возвращает данные бота', () => {
    const vimp = makeVimp();
    const deps = makeDeps();
    const bm = new BotManager(vimp, deps.game, deps.panel, deps.stat);
    bm.createMap(mapData());
    bm.createBots(1, 'team1');

    expect(bm.getBotById('_0')).toMatchObject({ team: 'team1', isBot: true });
  });
});
