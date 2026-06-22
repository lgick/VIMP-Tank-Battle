import { describe, it, expect } from 'vitest';
import VIMP from '../../src/server/modules/VIMP.js';

// VIMP — огромный синглтон с тяжёлым конструктором. Тестируем
// изолированные методы через прототип, подставляя минимальный `this`.
const withMethods = ctx => {
  ctx.checkName = VIMP.prototype.checkName;
  ctx._getNextActivePlayerForUser =
    VIMP.prototype._getNextActivePlayerForUser;
  ctx.triggerCameraShake = VIMP.prototype.triggerCameraShake;
  return ctx;
};

describe('VIMP.checkName: уникализация имён', () => {
  it('уникальное имя не меняется', () => {
    const ctx = withMethods({ _users: { u1: { name: 'Alice' } } });
    expect(ctx.checkName('Bob')).toBe('Bob');
  });

  it('при коллизии добавляет #1', () => {
    const ctx = withMethods({ _users: { u1: { name: 'Bob' } } });
    expect(ctx.checkName('Bob')).toBe('Bob#1');
  });

  it('при цепочке коллизий увеличивает номер', () => {
    const ctx = withMethods({
      _users: { u1: { name: 'Bob' }, u2: { name: 'Bob#1' } },
    });
    expect(ctx.checkName('Bob')).toBe('Bob#2');
  });
});

describe('VIMP._getNextActivePlayerForUser: циклический выбор', () => {
  const ctx = () =>
    withMethods({
      _users: { me: { watchedGameId: 'p2' } },
      _activePlayersList: ['p1', 'p2', 'p3'],
    });

  it('вперёд берёт следующего', () => {
    expect(ctx()._getNextActivePlayerForUser('me', false)).toBe('p3');
  });

  it('назад берёт предыдущего', () => {
    expect(ctx()._getNextActivePlayerForUser('me', true)).toBe('p1');
  });

  it('вперёд с последнего зацикливается на первого', () => {
    const c = withMethods({
      _users: { me: { watchedGameId: 'p3' } },
      _activePlayersList: ['p1', 'p2', 'p3'],
    });
    expect(c._getNextActivePlayerForUser('me', false)).toBe('p1');
  });

  it('назад с первого зацикливается на последнего', () => {
    const c = withMethods({
      _users: { me: { watchedGameId: 'p1' } },
      _activePlayersList: ['p1', 'p2', 'p3'],
    });
    expect(c._getNextActivePlayerForUser('me', true)).toBe('p3');
  });

  it('без наблюдаемого игрока возвращает первого', () => {
    const c = withMethods({
      _users: { me: { watchedGameId: 'unknown' } },
      _activePlayersList: ['p1', 'p2'],
    });
    expect(c._getNextActivePlayerForUser('me', false)).toBe('p1');
  });

  it('пустой список даёт null', () => {
    const c = withMethods({
      _users: { me: { watchedGameId: 'x' } },
      _activePlayersList: [],
    });
    expect(c._getNextActivePlayerForUser('me', false)).toBeNull();
  });
});

describe('VIMP.triggerCameraShake', () => {
  it('сохраняет параметры тряски в пользователе', () => {
    const ctx = withMethods({ _users: { u1: {} } });
    ctx.triggerCameraShake('u1', { intensity: 20, duration: 200 });
    expect(ctx._users.u1.pendingShake).toBe('20:200');
  });

  it('неизвестный игрок игнорируется без ошибки', () => {
    const ctx = withMethods({ _users: {} });
    expect(() =>
      ctx.triggerCameraShake('ghost', { intensity: 1, duration: 1 }),
    ).not.toThrow();
  });
});
