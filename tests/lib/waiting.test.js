import { describe, it, expect, beforeEach, vi } from 'vitest';

// waiting читает game:maxPlayers на этапе импорта.
// Сбрасываем реестр модулей и заполняем СВЕЖИЙ экземпляр config
// до того, как waiting его импортирует.
const loadWaiting = async maxPlayers => {
  vi.resetModules();
  const config = (await import('../../src/lib/config.js')).default;
  config.set('game:maxPlayers', maxPlayers);
  const mod = await import('../../src/lib/waiting.js');
  return mod.default;
};

// промисификация колбэк-стиля
const call = (fn, ...args) =>
  new Promise(resolve => fn(...args, result => resolve(result)));

describe('waiting', () => {
  let waiting;

  beforeEach(async () => {
    waiting = await loadWaiting(2);
  });

  it('check добавляет игрока при наличии мест', async () => {
    expect(await call(waiting.check, 'p1')).toBe(true);
    expect(await call(waiting.check, 'p2')).toBe(true);
    // мест больше нет (maxPlayers = 2)
    expect(await call(waiting.check, 'p3')).toBe(false);
  });

  it('add возвращает [maxPlayers, позиция в очереди]', async () => {
    expect(await call(waiting.add, 'a')).toEqual([2, 1]);
    expect(await call(waiting.add, 'b')).toEqual([2, 2]);
  });

  it('remove освобождает место', async () => {
    await call(waiting.check, 'p1');
    await call(waiting.check, 'p2');
    waiting.remove('p1');
    // место освободилось
    expect(await call(waiting.check, 'p3')).toBe(true);
  });

  it('getNext выдаёт следующего из очереди и резервирует место', async () => {
    await call(waiting.add, 'q1');
    const next = await call(waiting.getNext);
    expect(next).toBe('q1');
  });

  it('getNext возвращает пустое значение, если очередь пуста', async () => {
    // примечание: возвращается undefined (shift пустого массива),
    // хотя по задумке инициализатора ожидался бы null
    expect(await call(waiting.getNext)).toBeUndefined();
  });

  it('createNotifyObject формирует позиции для ожидающих', async () => {
    await call(waiting.add, 'a');
    await call(waiting.add, 'b');
    const obj = await call(waiting.createNotifyObject);
    expect(obj).toEqual({ a: [2, 1], b: [2, 2] });
  });

  it('регрессия: maxPlayers undefined блокирует вход (хрупкость импорта)', async () => {
    const w = await loadWaiting(undefined);
    // при undefined maxPlayers никто не может зайти
    expect(await call(w.check, 'x')).toBe(false);
  });
});
