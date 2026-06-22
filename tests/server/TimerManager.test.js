import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// TimerManager — синглтон, перезагружаем модуль для изоляции
let TimerManager;

const timers = {
  mapTime: 600000,
  roundTime: 120000,
  timeStep: 1000 / 120,
  voteTime: 10000,
  timeBlockedVote: 30000,
  teamChangeGracePeriod: 10000,
  roundRestartDelay: 5000,
  mapChangeDelay: 2000,
  idleCheckInterval: 30000,
  rttPingInterval: 3000,
};

const makeCallbacks = () => ({
  onMapTimeEnd: vi.fn(),
  onRoundTimeEnd: vi.fn(),
  onShotTick: vi.fn(),
  onIdleCheck: vi.fn(),
  onSendPing: vi.fn(),
});

let callbacks;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  TimerManager = (await import('../../src/server/modules/TimerManager.js')).default;
  callbacks = makeCallbacks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('TimerManager: время раунда и карты', () => {
  it('getRoundTimeLeft уменьшается со временем (в секундах)', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundTimer();

    vi.setSystemTime(1_005_000); // прошло 5 секунд
    expect(tm.getRoundTimeLeft()).toBe(115); // (120000-5000)/1000
  });

  it('getRoundTimeLeft не уходит ниже 0', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundTimer();

    vi.setSystemTime(2_000_000); // далеко за пределами раунда
    expect(tm.getRoundTimeLeft()).toBe(0);
  });

  it('getMapTimeLeft возвращает остаток в миллисекундах', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startMapTimer();

    vi.setSystemTime(1_010_000); // прошло 10 секунд
    expect(tm.getMapTimeLeft()).toBe(590000);
  });

  it('таймер раунда вызывает onRoundTimeEnd по истечении', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundTimer();

    vi.advanceTimersByTime(timers.roundTime);
    expect(callbacks.onRoundTimeEnd).toHaveBeenCalledTimes(1);
  });
});

describe('TimerManager: смена команды', () => {
  it('разрешена внутри grace-периода', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundTimer();

    vi.setSystemTime(1_009_000); // 9 c < 10 c grace
    expect(tm.canChangeTeamInCurrentRound()).toBe(true);
  });

  it('запрещена после grace-периода', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundTimer();

    vi.setSystemTime(1_011_000); // 11 c > 10 c grace
    expect(tm.canChangeTeamInCurrentRound()).toBe(false);
  });
});

describe('TimerManager: таймеры голосования', () => {
  it('startVoteTimer вызывает колбэк по истечении voteTime', () => {
    const tm = new TimerManager(timers, callbacks);
    const onEnd = vi.fn();

    tm.startVoteTimer('map', onEnd);
    vi.advanceTimersByTime(timers.voteTime);

    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('stopAllVoteTimers отменяет активные голосования', () => {
    const tm = new TimerManager(timers, callbacks);
    const onEnd = vi.fn();

    tm.startVoteTimer('map', onEnd);
    tm.stopAllVoteTimers();
    vi.advanceTimersByTime(timers.voteTime * 2);

    expect(onEnd).not.toHaveBeenCalled();
  });

  it('isVoteBlocked отражает блокирующий таймер', () => {
    const tm = new TimerManager(timers, callbacks);

    expect(tm.isVoteBlocked('map')).toBe(false);
    tm.startVoteBlockTimer('map', vi.fn());
    expect(tm.isVoteBlocked('map')).toBe(true);

    vi.advanceTimersByTime(timers.timeBlockedVote);
    expect(tm.isVoteBlocked('map')).toBe(false); // снят по истечении
  });

  it('stopAllBlockedVoteTimers снимает блокировки', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startVoteBlockTimer('map', vi.fn());
    tm.stopAllBlockedVoteTimers();
    expect(tm.isVoteBlocked('map')).toBe(false);
  });
});

describe('TimerManager: отложенные действия', () => {
  it('startRoundRestartDelay вызывает onRoundTimeEnd', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startRoundRestartDelay();

    vi.advanceTimersByTime(timers.roundRestartDelay);
    expect(callbacks.onRoundTimeEnd).toHaveBeenCalledTimes(1);
  });

  it('startMapChangeDelay вызывает переданный колбэк', () => {
    const tm = new TimerManager(timers, callbacks);
    const onEnd = vi.fn();
    tm.startMapChangeDelay(onEnd);

    vi.advanceTimersByTime(timers.mapChangeDelay);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });
});

describe('TimerManager: периодические проверки', () => {
  it('startIdleCheckTimer вызывает onIdleCheck немедленно и затем периодически', () => {
    const tm = new TimerManager(timers, callbacks);
    tm.startIdleCheckTimer();

    // первый тик — синхронно при запуске
    expect(callbacks.onIdleCheck).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(timers.idleCheckInterval * 2);
    expect(callbacks.onIdleCheck).toHaveBeenCalledTimes(3);

    tm._stopIdleCheckTimer();
  });
});
