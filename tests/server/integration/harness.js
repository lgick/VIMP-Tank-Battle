import { vi } from 'vitest';

// Общий каркас интеграционных тестов VIMP.
//
// Все игровые модули — синглтоны, поэтому тест-файлы обязаны изолироваться через
// vi.resetModules() в beforeEach и импортировать всё ДИНАМИЧЕСКИ внутри теста
// (не статическим top-level import). Функции ниже принимают свежие классы/конфиг
// как аргументы либо импортируют их сами после сброса модулей.

// Загружает реальные конфиги в свежий синглтон config (зеркало src/server/main.js).
// Должна вызываться после vi.resetModules().
export const loadConfig = async () => {
  const config = (await import('../../../src/lib/config.js')).default;

  config.set('auth', (await import('../../../src/config/auth.js')).default);
  config.set('server', (await import('../../../src/config/server.js')).default);
  config.set('wsports', (await import('../../../src/config/wsports.js')).default);
  config.set('game', (await import('../../../src/config/game.js')).default);
  config.set('client', (await import('../../../src/config/client.js')).default);

  // dev-режим: без принудительного разрыва прошлого соединения
  config.set('server:oneConnection', false);
  config.set('game:isDevMode', true);

  return config;
};

// Перечень всех отправителей SocketManager, которые дёргает VIMP.
const SENDER_METHODS = [
  'sendConfig',
  'sendAuthData',
  'sendAuthResult',
  'sendPing',
  'sendClear',
  'sendTechInform',
  'sendMap',
  'sendFirstShot',
  'sendFirstVote',
  'sendShot',
  'sendPlayerDefaultShot',
  'sendSpectatorDefaultShot',
  'sendRoundStart',
  'sendRoundEnd',
  'sendVictory',
  'sendDefeat',
  'sendName',
  'sendFragSound',
  'sendGameOverSound',
];

// Фейковый SocketManager: вместо отправки в сеть пишет все исходящие кадры.
export class FakeSocketManager {
  constructor() {
    this.frames = []; // [{ method, socketId, args }]
    this._game = null;
    this._panel = null;
    this._stat = null;

    for (const method of SENDER_METHODS) {
      this[method] = (socketId, ...args) => {
        this.frames.push({ method, socketId, args });
      };
    }
  }

  injectServices(game, panel, stat) {
    this._game = game;
    this._panel = panel;
    this._stat = stat;
  }

  addUser() {}
  removeUser() {}

  close(socketId, code, key, arr) {
    this.frames.push({ method: 'close', socketId, args: [code, key, arr] });
  }

  // все кадры указанного метода
  framesOf(method) {
    return this.frames.filter(f => f.method === method);
  }

  // последний sendShot для конкретного сокета (payload-массив)
  lastShot(socketId) {
    const shots = this.frames.filter(
      f => f.method === 'sendShot' && f.socketId === socketId,
    );
    return shots.length ? shots[shots.length - 1].args[0] : null;
  }

  clear() {
    this.frames.length = 0;
  }
}

// Создаёт свежий VIMP с реальными модулями и фейковым SocketManager.
// Включает fake timers ДО конструктора (тот стартует таймеры/игровой цикл).
export const createVimp = async () => {
  vi.useFakeTimers();
  const config = await loadConfig();
  const VIMP = (await import('../../../src/server/modules/VIMP.js')).default;
  const socket = new FakeSocketManager();
  const vimp = new VIMP(config.get('game'), socket);
  return { vimp, socket, config };
};

// Ждёт один process.nextTick (fake timers его не подделывают).
export const nextTick = () => new Promise(resolve => process.nextTick(resolve));

// Полный онбординг игрока до isReady=true. Возвращает gameId.
export const connectPlayer = async (
  vimp,
  { name = 'P1', model = 'm1', socketId = 's1' } = {},
) => {
  let gameId;
  vimp.createUser({ name, model }, socketId, id => {
    gameId = id;
  });
  await nextTick();

  vimp.sendMap(gameId);
  vimp.mapReady(gameId);
  vimp.firstShotReady(gameId);

  return gameId;
};

// Игрок выбирает команду (становится активным).
export const joinTeam = (vimp, gameId, team = 'team1') => {
  vimp.parseVote(gameId, ['teamChange', team]);
};

// Прогоняет n тиков игрового цикла с фиксированным dt.
export const tick = (vimp, n = 1, dt = 1 / 120) => {
  for (let i = 0; i < n; i += 1) {
    vimp._onShotTick(dt);
  }
};

// Нажатие/отпускание клавиши игрока (формат wire: 'down:forward').
export const pressKey = (vimp, gameId, name, action = 'down') => {
  vimp.updateKeys(gameId, `${action}:${name}`);
};
