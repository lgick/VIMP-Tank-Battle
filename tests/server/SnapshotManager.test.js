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
