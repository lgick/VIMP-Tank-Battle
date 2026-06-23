import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createVimp,
  connectPlayer,
  joinTeam,
  tick,
  pressKey,
} from './harness.js';

// Интеграция: реальный VIMP + все реальные модули (физика planck в Game) +
// фейковый SocketManager. Каждый тест — свежий синглтон через vi.resetModules().

let vimp;
let socket;

beforeEach(async () => {
  vi.resetModules();
  // глушим служебный консоль-шум (kicks, и т.п.)
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  ({ vimp, socket } = await createVimp());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Интеграция: онбординг игрока', () => {
  it('проходит весь цикл connect→map→firstShot и становится ready', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });

    expect(vimp._participants.get(gameId)).toBeDefined();
    expect(vimp._participants.get(gameId).isReady).toBe(true);

    // ушли ключевые кадры онбординга
    expect(socket.framesOf('sendMap').length).toBeGreaterThan(0);
    expect(socket.framesOf('sendFirstShot').length).toBe(1);
    expect(socket.framesOf('sendFirstVote').length).toBe(1);
    expect(
      socket.framesOf('sendTechInform').some(f => f.args[0] === 'loading'),
    ).toBe(true);
  });

  it('спектатор получает кадры игры с координатами [0,0]', async () => {
    await connectPlayer(vimp, { socketId: 's1' });
    socket.clear();

    tick(vimp, 1);

    const shot = socket.lastShot('s1');
    expect(shot).not.toBeNull();
    const coords = shot[1];
    expect(coords[0]).toBe(0);
    expect(coords[1]).toBe(0);
  });
});

describe('Интеграция: выбор команды и спавн', () => {
  it('joinTeam делает игрока активным и создаёт танк в физике', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });

    joinTeam(vimp, gameId, 'team1');

    expect(vimp._participants.getActiveList()).toContain(gameId);
    expect(vimp._participants.get(gameId).isWatching).toBe(false);
    expect(vimp._game._playersData[gameId]).toBeDefined();
  });

  it('активный игрок получает кадры с реальными координатами', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    socket.clear();

    tick(vimp, 1);

    const shot = socket.lastShot('s1');
    const coords = shot[1];
    // респаун-координаты не в нуле
    expect(Math.abs(coords[0]) + Math.abs(coords[1])).toBeGreaterThan(0);
  });
});

describe('Интеграция: движение и стрельба (реальная физика)', () => {
  it('forward сдвигает танк', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    tick(vimp, 1);

    const before = vimp._game.getPosition(gameId);
    pressKey(vimp, gameId, 'forward', 'down');
    tick(vimp, 30);
    const after = vimp._game.getPosition(gameId);

    const moved = Math.hypot(after[0] - before[0], after[1] - before[1]);
    expect(moved).toBeGreaterThan(0);
  });

  it('fire (hitscan w1) порождает событие оружия в снапшоте', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    tick(vimp, 1);
    socket.clear();

    pressKey(vimp, gameId, 'fire', 'down'); // one-shot
    tick(vimp, 1);

    const shot = socket.lastShot('s1');
    expect(shot[0]).toHaveProperty('w1');
  });
});

describe('Интеграция: чат и команды', () => {
  it('обычное сообщение попадает в кадр чата', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    socket.clear();

    vimp.pushMessage(gameId, 'привет всем');
    tick(vimp, 1);

    const shot = socket.lastShot('s1');
    expect(shot[4]).not.toBe(0); // chatUser не пустой
  });

  it('команда /mapname отвечает системным сообщением игроку', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    socket.clear();

    vimp.pushMessage(gameId, '/mapname');
    tick(vimp, 1);

    const shot = socket.lastShot('s1');
    expect(shot[4]).not.toBe(0);
  });
});

describe('Интеграция: убийство → конец раунда (полный путь Game→VIMP)', () => {
  it('смертельный урон врагу завершает раунд и рассылает исход', async () => {
    const p1 = await connectPlayer(vimp, { name: 'A', socketId: 's1' });
    joinTeam(vimp, p1, 'team1');
    const p2 = await connectPlayer(vimp, { name: 'B', socketId: 's2' });
    joinTeam(vimp, p2, 'team2');

    expect(vimp._game.isAlive(p1)).toBe(true);
    expect(vimp._game.isAlive(p2)).toBe(true);
    socket.clear();

    // реальный путь: урон в Game → takeDamage → reportKill → _checkTeamWipe
    vimp._game.applyDamage(p2, p1, 'w1', 100);

    expect(vimp._game.isAlive(p2)).toBe(false);
    expect(socket.framesOf('sendVictory').length).toBeGreaterThan(0);
    expect(socket.framesOf('sendDefeat').length).toBeGreaterThan(0);
    const roundEnd = socket.framesOf('sendRoundEnd');
    expect(roundEnd.length).toBeGreaterThan(0);
    expect(roundEnd.some(f => f.args[0] === 'team1')).toBe(true);
  });
});

describe('Интеграция: смена карты одиночным голосом', () => {
  it('parseVote mapChange пересоздаёт мир на новой карте', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    const current = vimp._currentMap;
    const other = vimp._mapList.find(m => m !== current);
    socket.clear();

    vimp.parseVote(gameId, ['mapChange', other]);

    expect(vimp._currentMap).toBe(other);
    expect(socket.framesOf('sendClear').length).toBeGreaterThan(0);
    expect(socket.framesOf('sendMap').length).toBeGreaterThan(0);
  });
});

describe('Интеграция: idle-кик и дисконнект', () => {
  it('бездействующий активный игрок кикается', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');
    socket.clear();

    // делаем игрока «бездействующим» дольше порога
    vimp._participants.get(gameId).lastActionTime = Date.now() - 200000;
    vimp._kickIdleUsers();

    expect(
      socket.framesOf('close').some(f => f.args[1] === 'kickIdle'),
    ).toBe(true);
    expect(vimp._participants.get(gameId)).toBeUndefined();
  });

  it('removeUser полностью удаляет игрока из игры', async () => {
    const gameId = await connectPlayer(vimp, { socketId: 's1' });
    joinTeam(vimp, gameId, 'team1');

    vimp.removeUser(gameId);

    expect(vimp._participants.get(gameId)).toBeUndefined();
    expect(vimp._game._playersData[gameId]).toBeUndefined();
    expect(vimp._participants.getActiveList()).not.toContain(gameId);
  });
});

describe('Интеграция: RTT ping', () => {
  it('_sendPing рассылает пинги подключённым игрокам', async () => {
    await connectPlayer(vimp, { socketId: 's1' });
    socket.clear();

    vimp._sendPing();

    expect(socket.framesOf('sendPing').length).toBeGreaterThan(0);
  });
});
