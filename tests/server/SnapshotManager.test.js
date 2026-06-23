import { describe, it, expect, beforeEach, vi } from 'vitest';

let SnapshotManager;

// мок Game: управляемые getEvents/getWorldState
const makeGame = () => ({
  _events: null,
  _world: {},
  getEvents() {
    const e = this._events;
    this._events = null; // события одноразовые
    return e;
  },
  getWorldState() {
    // реалистичный Game отдаёт свежий объект состояния на каждый кадр
    return { ...this._world };
  },
});

beforeEach(async () => {
  vi.resetModules();
  SnapshotManager = (await import('../../src/server/modules/SnapshotManager.js')).default;
});

describe('SnapshotManager: частота отправки', () => {
  it('sendRate=1 отправляет каждый тик', () => {
    const game = makeGame();
    game._world = { players: { a: 1 } };
    const sm = new SnapshotManager(game, 1);

    expect(sm.processTick()).not.toBeNull();
    expect(sm.processTick()).not.toBeNull();
  });

  it('sendRate=2 пропускает каждый второй тик', () => {
    const game = makeGame();
    game._world = { players: {} };
    const sm = new SnapshotManager(game, 2);

    expect(sm.processTick()).toBeNull(); // tick 1 — пропуск
    expect(sm.processTick()).not.toBeNull(); // tick 2 — отправка
    expect(sm.processTick()).toBeNull(); // tick 3 — пропуск
  });

  it('sendRate < 1 нормализуется к 1', () => {
    const sm = new SnapshotManager(makeGame(), 0);
    expect(sm.processTick()).not.toBeNull();
  });
});

describe('SnapshotManager: буферизация событий', () => {
  it('массивы-события накапливаются между отправками', () => {
    const game = makeGame();
    game._world = {};
    const sm = new SnapshotManager(game, 2);

    game._events = { shots: ['s1'] };
    sm.processTick(); // tick 1 — пропуск, буфер: shots=[s1]

    game._events = { shots: ['s2'] };
    const snapshot = sm.processTick(); // tick 2 — отправка

    expect(snapshot.shots).toEqual(['s1', 's2']);
  });

  it('объекты-события мёржатся между отправками', () => {
    const game = makeGame();
    game._world = {};
    const sm = new SnapshotManager(game, 2);

    game._events = { effects: { e1: 1 } };
    sm.processTick();
    game._events = { effects: { e2: 2 } };
    const snapshot = sm.processTick();

    expect(snapshot.effects).toEqual({ e1: 1, e2: 2 });
  });

  it('буфер очищается после отправки', () => {
    const game = makeGame();
    game._world = {};
    const sm = new SnapshotManager(game, 1);

    game._events = { shots: ['s1'] };
    const first = sm.processTick();
    expect(first.shots).toEqual(['s1']);

    // следующий тик без событий — буфер пуст
    const second = sm.processTick();
    expect(second.shots).toBeUndefined();
  });

  it('reset очищает буфер и счётчик', () => {
    const game = makeGame();
    game._world = {};
    const sm = new SnapshotManager(game, 2);

    game._events = { shots: ['s1'] };
    sm.processTick(); // пропуск, буфер заполнен
    sm.reset();

    game._world = {};
    const snapshot = sm.processTick(); // после reset счётчик сброшен → пропуск
    expect(snapshot).toBeNull();
  });
});

describe('SnapshotManager: регрессия мутации worldState', () => {
  it('снапшот — та же ссылка, что и worldState (события дописываются в объект мира)', () => {
    const world = { shots: ['existing'] };
    let events = { shots: ['new'] };
    // намеренно отдаём ВНУТРЕННЮЮ ссылку, чтобы показать мутацию
    const game = {
      getEvents() {
        const e = events;
        events = null;
        return e;
      },
      getWorldState: () => world,
    };
    const sm = new SnapshotManager(game, 1);

    const snapshot = sm.processTick();

    // фиксируем текущее поведение: worldState мутируется напрямую.
    // Если getWorldState вернёт внутреннюю ссылку Game — это утечка состояния.
    expect(snapshot).toBe(world);
    expect(world.shots).toEqual(['existing', 'new']);
  });
});

// Фаза 0: подтверждаем, что бинаризация снапшота (будущая Фаза 4) читает
// данные неразрушающе. Реальный Game.getWorldState() отдаёт свежий контейнер
// со ссылками на кеш-массивы _cachedPlayersData; ключи событий (w1/w2e) не
// пересекаются с ключами моделей (m1), поэтому мёрж в processTick не мутирует кеш.
describe('SnapshotManager: изоляция данных snapshot (Фаза 0)', () => {
  // фейк, повторяющий контракт Game: свежий state-контейнер на каждый вызов,
  // но playerData — ссылки на стабильные кеш-массивы (как _cachedPlayersData)
  const makeRealisticGame = () => ({
    cache: {
      0: [10, 20, 0, 0, 0, 0, 0, 3, 8, 1],
      1: [30, 40, 0, 0, 0, 0, 0, 3, 8, 2],
    },
    _pendingEvents: null,
    getEvents() {
      const e = this._pendingEvents;
      this._pendingEvents = null;
      return e;
    },
    getWorldState() {
      const state = {};

      for (const id in this.cache) {
        if (Object.hasOwn(this.cache, id)) {
          state.m1 = state.m1 || {};
          state.m1[id] = this.cache[id];
        }
      }

      return state;
    },
  });

  it('после processTick повторный getWorldState отдаёт неповреждённые данные', () => {
    const game = makeRealisticGame();
    const sm = new SnapshotManager(game, 1);

    game._pendingEvents = { w1: [{ x: 1 }], w2e: [{ x: 2 }] };

    const snap = sm.processTick();

    expect(snap.m1[0]).toEqual([10, 20, 0, 0, 0, 0, 0, 3, 8, 1]);
    expect(snap.w1).toEqual([{ x: 1 }]);
    expect(snap.w2e).toEqual([{ x: 2 }]);

    // повторное чтение (как сделает бинаризатор) — данные те же, кеш не тронут
    const ws = game.getWorldState();

    expect(ws.m1[0]).toEqual([10, 20, 0, 0, 0, 0, 0, 3, 8, 1]);
    expect(ws.m1[0]).toBe(game.cache[0]); // тот же кеш-массив, не мутирован
    expect(ws.m1).not.toBe(snap.m1); // контейнер свежий каждый вызов
  });

  it('события не протекают в состояние мира и не дублируются на следующем тике', () => {
    const game = makeRealisticGame();
    const sm = new SnapshotManager(game, 1);

    game._pendingEvents = { w1: [{ x: 1 }], w2e: [{ x: 2 }] };
    sm.processTick();

    // состояние мира не содержит ключей событий
    const ws = game.getWorldState();
    expect(ws.w1).toBeUndefined();
    expect(ws.w2e).toBeUndefined();

    // следующий тик без событий — буфер очищен, дублей нет
    const snap2 = sm.processTick();
    expect(snap2.w1).toBeUndefined();
    expect(snap2.w2e).toBeUndefined();
    expect(snap2.m1[0]).toEqual([10, 20, 0, 0, 0, 0, 0, 3, 8, 1]);
  });
});
