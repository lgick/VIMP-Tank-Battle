import { describe, it, expect, vi } from 'vitest';
import VIMP from '../../src/server/modules/VIMP.js';

// VIMP — огромный синглтон с тяжёлым конструктором. Тестируем
// изолированные методы через прототип, подставляя минимальный `this`.

// привязывает указанные методы прототипа к фейковому контексту
const bind = (ctx, ...names) => {
  for (const name of names) {
    ctx[name] = VIMP.prototype[name];
  }
  return ctx;
};

// фейковый ParticipantManager: единый источник истины для участников.
// usersMap — { gameId: participant }, activeList — gameId[].
const fakeParticipants = (usersMap = {}, activeList = []) => {
  const map = new Map(Object.entries(usersMap));

  return {
    get: id => map.get(id),
    getAll: () => [...map.values()],
    getHumans: () => [...map.values()].filter(p => !p.isBot),
    getActiveList: () => activeList,
    replaceWatched: vi.fn(),
  };
};

describe('VIMP._getNextActivePlayerForUser: циклический выбор', () => {
  const ctx = (watchedGameId, activeList) =>
    bind(
      {
        _participants: fakeParticipants({ me: { watchedGameId } }, activeList),
      },
      '_getNextActivePlayerForUser',
    );

  it('вперёд берёт следующего', () => {
    expect(
      ctx('p2', ['p1', 'p2', 'p3'])._getNextActivePlayerForUser('me', false),
    ).toBe('p3');
  });

  it('назад берёт предыдущего', () => {
    expect(
      ctx('p2', ['p1', 'p2', 'p3'])._getNextActivePlayerForUser('me', true),
    ).toBe('p1');
  });

  it('вперёд с последнего зацикливается на первого', () => {
    expect(
      ctx('p3', ['p1', 'p2', 'p3'])._getNextActivePlayerForUser('me', false),
    ).toBe('p1');
  });

  it('назад с первого зацикливается на последнего', () => {
    expect(
      ctx('p1', ['p1', 'p2', 'p3'])._getNextActivePlayerForUser('me', true),
    ).toBe('p3');
  });

  it('без наблюдаемого игрока возвращает первого', () => {
    expect(
      ctx('unknown', ['p1', 'p2'])._getNextActivePlayerForUser('me', false),
    ).toBe('p1');
  });

  it('пустой список даёт null', () => {
    expect(ctx('x', [])._getNextActivePlayerForUser('me', false)).toBeNull();
  });
});

describe('VIMP.triggerCameraShake', () => {
  it('сохраняет параметры тряски в пользователе', () => {
    const user = {};
    const ctx = bind(
      { _participants: fakeParticipants({ u1: user }) },
      'triggerCameraShake',
    );
    ctx.triggerCameraShake('u1', { intensity: 20, duration: 200 });
    expect(user.pendingShake).toBe('20:200');
  });

  it('неизвестный игрок игнорируется без ошибки', () => {
    const ctx = bind(
      { _participants: fakeParticipants({}) },
      'triggerCameraShake',
    );
    expect(() =>
      ctx.triggerCameraShake('ghost', { intensity: 1, duration: 1 }),
    ).not.toThrow();
  });
});

describe('VIMP: кики по RTT', () => {
  it('_kickForMaxLatency закрывает сокет и удаляет игрока', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const sm = { close: vi.fn() };
    const ctx = bind(
      {
        _participants: fakeParticipants({ u1: { name: 'A', socketId: 's1' } }),
        _socketManager: sm,
        removeUser: vi.fn(),
      },
      '_kickForMaxLatency',
    );

    ctx._kickForMaxLatency('u1');

    expect(sm.close).toHaveBeenCalledWith('s1', 4003, 'kickForMaxLatency');
    expect(ctx.removeUser).toHaveBeenCalledWith('u1');
    console.warn.mockRestore();
  });

  it('_kickForMissedPings игнорирует неизвестного игрока', () => {
    const sm = { close: vi.fn() };
    const ctx = bind(
      {
        _participants: fakeParticipants({}),
        _socketManager: sm,
        removeUser: vi.fn(),
      },
      '_kickForMissedPings',
    );

    ctx._kickForMissedPings('ghost');

    expect(sm.close).not.toHaveBeenCalled();
    expect(ctx.removeUser).not.toHaveBeenCalled();
  });
});

describe('VIMP.reportKill', () => {
  const makeCtx = () => {
    const users = {
      v: { gameId: 'v', teamId: 1, socketId: 'sv', isNetworked: true },
      k: { gameId: 'k', teamId: 2, socketId: 'sk', isNetworked: true, name: 'K' },
      ally: {
        gameId: 'ally',
        teamId: 1,
        socketId: 'sa',
        isNetworked: true,
        name: 'Ally',
      },
    };

    return bind(
      {
        _participants: fakeParticipants(users),
        _stat: { updateUser: vi.fn() },
        _panel: { invalidate: vi.fn() },
        _socketManager: {
          sendSpectatorDefaultShot: vi.fn(),
          sendGameOverSound: vi.fn(),
          sendFragSound: vi.fn(),
        },
        _chat: { pushSystem: vi.fn() },
        _checkTeamWipe: vi.fn(),
      },
      'reportKill',
    );
  };

  it('игнорирует неизвестную жертву', () => {
    const ctx = makeCtx();
    ctx.reportKill('ghost', 'k');
    expect(ctx._stat.updateUser).not.toHaveBeenCalled();
  });

  it('помечает жертву мёртвой и переводит в наблюдатели', () => {
    const ctx = makeCtx();
    ctx.reportKill('v', 'k');

    expect(ctx._participants.get('v').isWatching).toBe(true);
    expect(ctx._stat.updateUser).toHaveBeenCalledWith('v', 1, {
      deaths: 1,
      status: 'dead',
    });
    expect(ctx._panel.invalidate).toHaveBeenCalledWith('v');
  });

  it('начисляет фраг убийце-врагу и проверяет вайп', () => {
    const ctx = makeCtx();
    ctx.reportKill('v', 'k');

    expect(ctx._stat.updateUser).toHaveBeenCalledWith('k', 2, { score: 1 });
    expect(ctx._socketManager.sendFragSound).toHaveBeenCalledWith('sk');
    expect(ctx._participants.replaceWatched).toHaveBeenCalledWith('v', 'k');
    expect(ctx._checkTeamWipe).toHaveBeenCalledWith(1, 2);
  });

  it('снимает очко за огонь по своим', () => {
    const ctx = makeCtx();
    ctx.reportKill('v', 'ally'); // обе команды teamId 1

    expect(ctx._stat.updateUser).toHaveBeenCalledWith('ally', 1, { score: -1 });
  });

  it('самоубийство не меняет счёт', () => {
    const ctx = makeCtx();
    ctx.reportKill('v', 'v');

    const scoreCall = ctx._stat.updateUser.mock.calls.find(
      ([, , data]) => 'score' in data,
    );
    expect(scoreCall).toBeUndefined();
  });

  it('без убийцы только фиксирует смерть', () => {
    const ctx = makeCtx();
    ctx.reportKill('v');

    expect(ctx._checkTeamWipe).not.toHaveBeenCalled();
    expect(ctx._chat.pushSystem).not.toHaveBeenCalled();
  });
});

describe('VIMP._checkTeamWipe', () => {
  const makeCtx = (overrides = {}) => {
    const users = {
      a: { gameId: 'a', teamId: 1, socketId: 'sa' },
      b: { gameId: 'b', teamId: 2, socketId: 'sb' },
    };

    return bind(
      {
        _isRoundEnding: false,
        _spectatorId: 3,
        _participants: fakeParticipants(users),
        _game: { isAlive: () => false },
        _stat: { updateHead: vi.fn() },
        _teams: { red: 1, blue: 2 },
        _socketManager: {
          sendDefeat: vi.fn(),
          sendVictory: vi.fn(),
          sendRoundEnd: vi.fn(),
        },
        _timerManager: {
          stopRoundTimer: vi.fn(),
          startRoundRestartDelay: vi.fn(),
        },
        ...overrides,
      },
      '_checkTeamWipe',
    );
  };

  it('завершает раунд при уничтожении команды и рассылает исход', () => {
    const ctx = makeCtx();
    ctx._checkTeamWipe(1, 2);

    expect(ctx._isRoundEnding).toBe(true);
    expect(ctx._stat.updateHead).toHaveBeenCalledWith(1, 'deaths', 1);
    expect(ctx._stat.updateHead).toHaveBeenCalledWith(2, 'score', 1);
    expect(ctx._socketManager.sendDefeat).toHaveBeenCalledWith('sa');
    expect(ctx._socketManager.sendVictory).toHaveBeenCalledWith('sb');
    expect(ctx._socketManager.sendRoundEnd).toHaveBeenCalledWith('sa', 'blue');
    expect(ctx._timerManager.startRoundRestartDelay).toHaveBeenCalled();
  });

  it('не срабатывает, если раунд уже завершается', () => {
    const ctx = makeCtx({ _isRoundEnding: true });
    ctx._checkTeamWipe(1, 2);
    expect(ctx._stat.updateHead).not.toHaveBeenCalled();
  });

  it('игнорирует команду наблюдателей', () => {
    const ctx = makeCtx();
    ctx._checkTeamWipe(3, 2); // victimTeamId === _spectatorId
    expect(ctx._stat.updateHead).not.toHaveBeenCalled();
  });

  it('не завершает раунд, если в команде есть живой', () => {
    const ctx = makeCtx({ _game: { isAlive: () => true } });
    ctx._checkTeamWipe(1, 2);
    expect(ctx._isRoundEnding).toBe(false);
    expect(ctx._stat.updateHead).not.toHaveBeenCalled();
  });
});

describe('VIMP.updateKeys', () => {
  it('наблюдатель листает игроков вперёд', () => {
    const user = { isWatching: true, watchedGameId: 'x' };
    const ctx = bind(
      {
        _participants: fakeParticipants({ u: user }),
        _spectatorKeys: { nextPlayer: 'n', prevPlayer: 'p' },
        _getNextActivePlayerForUser: vi.fn(() => 'next'),
        _game: { updateKeys: vi.fn() },
      },
      'updateKeys',
    );

    ctx.updateKeys('u', 'down:n');

    expect(user.watchedGameId).toBe('next');
    expect(user.forceCameraReset).toBe(true);
    expect(ctx._game.updateKeys).not.toHaveBeenCalled();
  });

  it('активный игрок передаёт клавиши в игру', () => {
    const ctx = bind(
      {
        _participants: fakeParticipants({ u: { isWatching: false } }),
        _spectatorKeys: { nextPlayer: 'n', prevPlayer: 'p' },
        _game: { updateKeys: vi.fn() },
      },
      'updateKeys',
    );

    ctx.updateKeys('u', 'down:forward');

    expect(ctx._game.updateKeys).toHaveBeenCalledWith('u', {
      action: 'down',
      name: 'forward',
    });
  });
});

describe('VIMP.pushMessage', () => {
  const makeCtx = () =>
    bind(
      {
        _participants: fakeParticipants({
          u: { isReady: true, name: 'A', teamId: 1 },
        }),
        _parseCommand: vi.fn(),
        _chat: { push: vi.fn() },
      },
      'pushMessage',
    );

  it('обычное сообщение уходит в чат', () => {
    const ctx = makeCtx();
    ctx.pushMessage('u', 'hello world');
    expect(ctx._chat.push).toHaveBeenCalledWith('hello world', 'A', 1);
  });

  it('сообщение-команда уходит в парсер', () => {
    const ctx = makeCtx();
    ctx.pushMessage('u', '/bots 3');
    expect(ctx._parseCommand).toHaveBeenCalledWith('u', '/bots 3');
  });

  it('неготовый пользователь игнорируется', () => {
    const ctx = makeCtx();
    ctx._participants.get('u').isReady = false;
    ctx.pushMessage('u', 'hello');
    expect(ctx._chat.push).not.toHaveBeenCalled();
  });
});

describe('VIMP.parseVote', () => {
  const makeCtx = (users = { u: { isReady: true } }) =>
    bind(
      {
        _participants: fakeParticipants(users),
        _teams: { red: 1, blue: 2 },
        _mapList: ['m1', 'm2', 'm3'],
        _currentMap: 'm2',
        _vote: { pushByUser: vi.fn(), addInVote: vi.fn() },
        _chat: { pushSystemByUser: vi.fn() },
        _changeTeam: vi.fn(),
        _changeMap: vi.fn(),
        _createMap: vi.fn(),
      },
      'parseVote',
    );

  it('запрос teams отдаёт список команд', () => {
    const ctx = makeCtx();
    ctx.parseVote('u', 'teams');
    expect(ctx._vote.pushByUser).toHaveBeenCalledWith('u', ['red', 'blue']);
  });

  it('запрос maps исключает текущую карту', () => {
    const ctx = makeCtx();
    ctx.parseVote('u', 'maps');
    expect(ctx._vote.pushByUser).toHaveBeenCalledWith('u', ['m1', 'm3']);
  });

  it('teamChange делегирует смену команды', () => {
    const ctx = makeCtx();
    ctx.parseVote('u', ['teamChange', 'blue']);
    expect(ctx._changeTeam).toHaveBeenCalledWith('u', 'blue');
  });

  it('mapChange при одном игроке меняет карту сразу', () => {
    const ctx = makeCtx();
    ctx.parseVote('u', ['mapChange', 'm3']);
    expect(ctx._currentMap).toBe('m3');
    expect(ctx._createMap).toHaveBeenCalled();
  });

  it('mapChange при нескольких игроках запускает голосование', () => {
    const ctx = makeCtx({ u: { isReady: true }, u2: { isReady: true } });
    ctx.parseVote('u', ['mapChange', 'm3']);
    expect(ctx._changeMap).toHaveBeenCalledWith('u', 'm3');
  });

  it('прочий тип учитывается как голос', () => {
    const ctx = makeCtx();
    ctx.parseVote('u', ['kickBot', 'Yes']);
    expect(ctx._vote.addInVote).toHaveBeenCalledWith('kickBot', 'Yes');
    expect(ctx._chat.pushSystemByUser).toHaveBeenCalledWith('u', 'VOTE_ACCEPTED');
  });

  it('неготовый пользователь игнорируется', () => {
    const ctx = makeCtx();
    ctx._participants.get('u').isReady = false;
    ctx.parseVote('u', 'teams');
    expect(ctx._vote.pushByUser).not.toHaveBeenCalled();
  });
});

describe('VIMP._canCreateVote', () => {
  it('запрещает при заблокированной категории', () => {
    const ctx = bind(
      {
        _timerManager: { isVoteBlocked: () => true },
        _vote: { hasVoteCategory: () => false },
        _chat: { pushSystemByUser: vi.fn() },
      },
      '_canCreateVote',
    );

    expect(ctx._canCreateVote('mapChange', 'u')).toBe(false);
    expect(ctx._chat.pushSystemByUser).toHaveBeenCalledWith('u', 'VOTE_UNAVAILABLE');
  });

  it('разрешает, когда категория свободна', () => {
    const ctx = bind(
      {
        _timerManager: { isVoteBlocked: () => false },
        _vote: { hasVoteCategory: () => false },
        _chat: { pushSystemByUser: vi.fn() },
      },
      '_canCreateVote',
    );

    expect(ctx._canCreateVote('mapChange', 'u')).toBe(true);
    expect(ctx._chat.pushSystemByUser).not.toHaveBeenCalled();
  });
});

describe('VIMP._getMapList: пагинация', () => {
  it('возвращает весь список, если он не длиннее лимита', () => {
    const ctx = bind(
      { _mapList: ['m1', 'm2'], _mapsInVote: 3, _startMapNumber: 0 },
      '_getMapList',
    );
    expect(ctx._getMapList()).toEqual(['m1', 'm2']);
  });

  it('листает страницы и зацикливается с переполнением', () => {
    const ctx = bind(
      { _mapList: ['m1', 'm2', 'm3', 'm4'], _mapsInVote: 2, _startMapNumber: 0 },
      '_getMapList',
    );

    expect(ctx._getMapList()).toEqual(['m1', 'm2']);
    expect(ctx._getMapList()).toEqual(['m3', 'm4']);
    // следующая страница выходит за конец → дозабор с начала
    expect(ctx._getMapList()).toEqual(['m1', 'm2']);
  });
});

describe('VIMP.updateRTT', () => {
  it('пишет задержку в статистику', () => {
    const ctx = bind(
      {
        _RTTManager: { handlePong: vi.fn(() => 42) },
        _participants: fakeParticipants({ u: { teamId: 1 } }),
        _stat: { updateUser: vi.fn() },
      },
      'updateRTT',
    );

    ctx.updateRTT('u', 'ping1');

    expect(ctx._stat.updateUser).toHaveBeenCalledWith('u', 1, { latency: 42 });
  });

  it('ничего не пишет при отсутствии валидного pong', () => {
    const ctx = bind(
      {
        _RTTManager: { handlePong: vi.fn(() => null) },
        _participants: fakeParticipants({ u: { teamId: 1 } }),
        _stat: { updateUser: vi.fn() },
      },
      'updateRTT',
    );

    ctx.updateRTT('u', 'ping1');

    expect(ctx._stat.updateUser).not.toHaveBeenCalled();
  });
});

describe('VIMP._resetVote', () => {
  it('останавливает таймеры голосований и сбрасывает vote', () => {
    const ctx = bind(
      {
        _timerManager: {
          stopAllVoteTimers: vi.fn(),
          stopAllBlockedVoteTimers: vi.fn(),
        },
        _vote: { reset: vi.fn() },
      },
      '_resetVote',
    );

    ctx._resetVote();

    expect(ctx._timerManager.stopAllVoteTimers).toHaveBeenCalled();
    expect(ctx._timerManager.stopAllBlockedVoteTimers).toHaveBeenCalled();
    expect(ctx._vote.reset).toHaveBeenCalled();
  });
});
