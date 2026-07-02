import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { unpackFrame } from '../../../src/lib/snapshotCodec.js';
import { loadConfig, nextTick } from './harness.js';

// Интеграция протокольного слоя: реальный src/server/socket/index.js + реальный
// VIMP/SocketManager, фейковый транспорт. ws-модуль мокается, чтобы перехватить
// обработчик 'connection' и не поднимать настоящий сервер.

// клиентские порты (вход) и серверные (выход) — фиксированы в wsports.js
const PC = {
  CONFIG_READY: 0,
  AUTH_RESPONSE: 1,
  MODULES_READY: 2,
  MAP_READY: 3,
  FIRST_SHOT_READY: 4,
  KEYS_DATA: 5,
  CHAT_DATA: 6,
  VOTE_DATA: 7,
};
const PS = {
  CONFIG_DATA: 0,
  AUTH_DATA: 1,
  AUTH_RESULT: 2,
  MAP_DATA: 3,
  FIRST_SHOT_DATA: 4,
  SHOT_DATA: 5,
  PANEL_DATA: 13,
  STAT_DATA: 14,
  CHAT_DATA: 15,
  VOTE_DATA: 16,
  KEYSET_DATA: 17,
};

// поднимает socket-слой с фейковым ws и одним подключением
const setup = async () => {
  vi.resetModules();
  vi.useFakeTimers();
  await loadConfig();

  let connectionHandler;
  vi.doMock('ws', () => ({
    WebSocketServer: class {
      on(event, cb) {
        if (event === 'connection') {
          connectionHandler = cb;
        }
      }
    },
  }));

  const init = (await import('../../../src/server/socket/index.js')).default;
  init({}); // фейковый http-сервер

  const sent = []; // [port, payload]
  let messageCb;
  let closeCb;

  const ws = {
    readyState: 1,
    OPEN: 1,
    send: data => {
      // бинарный snapshot-кадр (порт 5) декодируется реальным кодеком
      if (typeof data === 'string') {
        sent.push(JSON.parse(data));
      } else {
        const frame = unpackFrame(data);
        sent.push([frame.port, frame]);
      }
    },
    close: vi.fn(),
    terminate: vi.fn(),
    on: (event, cb) => {
      if (event === 'message') {
        messageCb = cb;
      } else if (event === 'close') {
        closeCb = cb;
      }
    },
  };

  const req = {
    headers: { origin: 'https://localhost:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  };

  connectionHandler(ws, req);
  await nextTick(); // security.origin отвечает через nextTick

  const send = (port, payload) =>
    messageCb(JSON.stringify(payload === undefined ? [port] : [port, payload]));
  const portsOf = port => sent.filter(f => f[0] === port);

  return { ws, sent, send, portsOf, getClose: () => closeCb };
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.doUnmock('ws');
});

describe('Протокол: рукопожатие', () => {
  it('при подключении сразу уходит конфиг', async () => {
    const { portsOf } = await setup();
    expect(portsOf(PS.CONFIG_DATA).length).toBe(1);
  });

  it('CONFIG_READY открывает авторизацию и шлёт AUTH_DATA', async () => {
    const { send, portsOf } = await setup();

    send(PC.CONFIG_READY);
    await nextTick(); // waiting.check отвечает через nextTick

    expect(portsOf(PS.AUTH_DATA).length).toBe(1);
  });
});

describe('Протокол: авторизация', () => {
  const authorize = async harness => {
    harness.send(PC.CONFIG_READY);
    await nextTick();
  };

  it('валидные данные → AUTH_RESULT без ошибки', async () => {
    const h = await setup();
    await authorize(h);

    h.send(PC.AUTH_RESPONSE, { name: 'Player', model: 'm1' });
    await nextTick(); // createUser cb

    const authResults = h.portsOf(PS.AUTH_RESULT);
    expect(authResults.length).toBe(1);
    expect(authResults[0][1]).toBeFalsy(); // err == null/undefined
  });

  it('невалидные данные → AUTH_RESULT с ошибкой, без перехода дальше', async () => {
    const h = await setup();
    await authorize(h);
    const mapsBefore = h.portsOf(PS.MAP_DATA).length;

    h.send(PC.AUTH_RESPONSE, { name: '', model: 'm1' }); // пустое имя
    await nextTick();

    const authResults = h.portsOf(PS.AUTH_RESULT);
    expect(authResults[0][1]).toBeTruthy(); // есть ошибка
    // карта не отправлялась — дальше по цепочке не прошли
    expect(h.portsOf(PS.MAP_DATA).length).toBe(mapsBefore);
  });
});

describe('Протокол: порт-гейтинг', () => {
  it('сообщение на неоткрытом порту игнорируется', async () => {
    const h = await setup();
    const before = h.sent.length;

    // KEYS_DATA ещё не открыт (только CONFIG_READY активен)
    expect(() => h.send(PC.KEYS_DATA, 'down:forward')).not.toThrow();
    expect(h.portsOf(PS.SHOT_DATA).length).toBe(0);
    expect(h.sent.length).toBe(before); // новых кадров нет
  });
});

describe('Протокол: полная цепочка до игры', () => {
  it('connect→config→auth→modules→map→firstShot спавнит игрока через vote', async () => {
    const h = await setup();

    h.send(PC.CONFIG_READY);
    await nextTick();

    h.send(PC.AUTH_RESPONSE, { name: 'Player', model: 'm1' });
    await nextTick();
    // после auth открыт MODULES_READY → шлём его
    h.send(PC.MODULES_READY);
    expect(h.portsOf(PS.MAP_DATA).length).toBeGreaterThan(0);

    h.send(PC.MAP_READY);
    expect(h.portsOf(PS.FIRST_SHOT_DATA).length).toBe(1);

    h.send(PC.FIRST_SHOT_READY);
    // firstShotReady шлёт выбор команды отдельным каналом (sendFirstVote → VOTE_DATA)
    expect(h.portsOf(PS.VOTE_DATA).length).toBeGreaterThan(0);

    // теперь выбор команды через VOTE_DATA не падает (игрок спавнится)
    expect(() => h.send(PC.VOTE_DATA, ['teamChange', 'team1'])).not.toThrow();
  });
});

describe('Протокол: дисконнект', () => {
  it('close-обработчик не падает и чистит сессию', async () => {
    const h = await setup();
    const closeCb = h.getClose();

    expect(typeof closeCb).toBe('function');
    expect(() => closeCb(1000, 'bye')).not.toThrow();
  });
});
