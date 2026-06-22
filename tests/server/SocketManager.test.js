import { describe, it, expect, beforeEach, vi } from 'vitest';
import SocketManager from '../../src/server/socket/SocketManager.js';

const ports = {
  CONFIG_DATA: 0,
  AUTH_DATA: 1,
  AUTH_RESULT: 2,
  MAP_DATA: 3,
  FIRST_SHOT_DATA: 4,
  SHOT_DATA: 5,
  SOUND_DATA: 6,
  GAME_INFORM_DATA: 7,
  TECH_INFORM_DATA: 8,
  MISC: 9,
  PING: 10,
  CLEAR: 11,
  CONSOLE: 12,
};

const makeSocket = () => ({ send: vi.fn(), close: vi.fn() });

let sm;
let socket;

beforeEach(() => {
  sm = new SocketManager(ports);
  socket = makeSocket();
  sm.addUser('s1', socket);
});

describe('SocketManager: маршрутизация портов', () => {
  it('sendConfig уходит на порт CONFIG_DATA', () => {
    sm.sendConfig('s1', { a: 1 });
    expect(socket.send).toHaveBeenCalledWith(0, { a: 1 });
  });

  it('sendPing уходит на порт PING', () => {
    sm.sendPing('s1', 7);
    expect(socket.send).toHaveBeenCalledWith(10, 7);
  });

  it('sendName формирует команду замены имени', () => {
    sm.sendName('s1', 'Bob');
    expect(socket.send).toHaveBeenCalledWith(9, {
      key: 'localstorageNameReplace',
      value: 'Bob',
    });
  });

  it('sendClear со списком и без', () => {
    sm.sendClear('s1', ['c1']);
    expect(socket.send).toHaveBeenCalledWith(11, ['c1']);

    socket.send.mockClear();
    sm.sendClear('s1');
    // без данных второй аргумент явно undefined
    expect(socket.send).toHaveBeenCalledWith(11, undefined);
  });
});

describe('SocketManager: технические сообщения', () => {
  it('sendTechInform по ключу подставляет код', () => {
    sm.sendTechInform('s1', 'fullServer');
    expect(socket.send).toHaveBeenCalledWith(8, [0]);
  });

  it('sendTechInform с массивом параметров', () => {
    sm.sendTechInform('s1', 'kickIdle', ['reason']);
    expect(socket.send).toHaveBeenCalledWith(8, [3, ['reason']]);
  });

  it('close с ключом отправляет код закрытия и данные', () => {
    sm.close('s1', 4000, 'kickForMaxLatency');
    expect(socket.close).toHaveBeenCalledWith(4000, [4]);
  });

  it('close без ключа закрывает без данных', () => {
    sm.close('s1', 1000);
    expect(socket.close).toHaveBeenCalledWith(1000, undefined);
  });
});

describe('SocketManager: игровые сообщения', () => {
  it('sendRoundStart шлёт звук и информер', () => {
    sm.sendRoundStart('s1');
    expect(socket.send).toHaveBeenCalledWith(6, 'roundStart');
    expect(socket.send).toHaveBeenCalledWith(7, [1]);
  });

  it('sendRoundEnd с победителем включает команду', () => {
    sm.sendRoundEnd('s1', 'team1');
    expect(socket.send).toHaveBeenCalledWith(7, [0, ['team1']]);
  });

  it('sendRoundEnd без победителя — gameOver', () => {
    sm.sendRoundEnd('s1');
    expect(socket.send).toHaveBeenCalledWith(7, [2]);
  });

  it('sendFirstShot собирает кадр из инжектированных сервисов', () => {
    const game = { getPlayersData: () => ({ p: 1 }) };
    const panel = { getEmptyPanel: () => ['t:120'] };
    const stat = { getFull: () => [[], []] };
    sm.injectServices(game, panel, stat);

    sm.sendFirstShot('s1');
    expect(socket.send).toHaveBeenCalledWith(4, [
      { p: 1 },
      0,
      ['t:120'],
      [[], []],
      0,
      0,
      0,
    ]);
  });
});

describe('SocketManager: простые отправители', () => {
  it('sendAuthData / sendAuthResult', () => {
    sm.sendAuthData('s1', { fields: 1 });
    expect(socket.send).toHaveBeenCalledWith(1, { fields: 1 });

    sm.sendAuthResult('s1', null);
    expect(socket.send).toHaveBeenCalledWith(2, null);
  });

  it('sendMap / sendShot', () => {
    sm.sendMap('s1', { map: 1 });
    expect(socket.send).toHaveBeenCalledWith(3, { map: 1 });

    sm.sendShot('s1', [1, 2]);
    expect(socket.send).toHaveBeenCalledWith(5, [1, 2]);
  });

  it('sendFirstVote шлёт запрос выбора команды', () => {
    sm.sendFirstVote('s1');
    expect(socket.send).toHaveBeenCalledWith(5, [
      {},
      0,
      0,
      0,
      0,
      { name: 'teamChange' },
    ]);
  });

  it('sendPlayerDefaultShot включает полную панель и keySet 1', () => {
    sm.injectServices(null, { getFullPanel: () => ['p'] }, null);
    sm.sendPlayerDefaultShot('s1', 'g1');
    expect(socket.send).toHaveBeenCalledWith(5, [{}, 0, ['p'], 0, 0, 0, 1]);
  });

  it('sendSpectatorDefaultShot включает пустую панель и keySet 0', () => {
    sm.injectServices(null, { getEmptyPanel: () => ['e'] }, null);
    sm.sendSpectatorDefaultShot('s1');
    expect(socket.send).toHaveBeenCalledWith(5, [{}, 0, ['e'], 0, 0, 0, 0]);
  });

  it('звуковые отправители уходят на порт SOUND_DATA', () => {
    sm.sendVictory('s1');
    expect(socket.send).toHaveBeenCalledWith(6, 'victory');

    sm.sendDefeat('s1');
    expect(socket.send).toHaveBeenCalledWith(6, 'defeat');

    sm.sendFragSound('s1');
    expect(socket.send).toHaveBeenCalledWith(6, 'frag');

    sm.sendGameOverSound('s1');
    expect(socket.send).toHaveBeenCalledWith(6, 'gameOver');
  });
});

describe('SocketManager: жизненный цикл соединений', () => {
  it('removeUser отключает отправку и логирует попытку', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sm.removeUser('s1');

    sm.sendConfig('s1', {});
    expect(socket.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('отправка несуществующему сокету не падает', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => sm.sendConfig('ghost', {})).not.toThrow();
    warn.mockRestore();
  });
});
