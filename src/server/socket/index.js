import { WebSocketServer } from 'ws';
import { v1 as uuidv1 } from 'uuid';
import security from '../../lib/security.js';
import waiting from '../../lib/waiting.js';
import validator from '../../lib/validator.js';
import config from '../../lib/config.js';

// PC (client ports)
const PC_CONFIG_DATA = config.get('wsports:client:CONFIG_DATA');
const PC_AUTH_DATA = config.get('wsports:client:AUTH_DATA');
const PC_AUTH_ERRORS = config.get('wsports:client:AUTH_ERRORS');
const PC_INFORM_DATA = config.get('wsports:client:INFORM_DATA');
const PC_PING = config.get('wsports:client:PING');

// PS (server ports)
const PS_CONFIG_READY = config.get('wsports:server:CONFIG_READY');
const PS_AUTH_RESPONSE = config.get('wsports:server:AUTH_RESPONSE');
const PS_MAP_READY = config.get('wsports:server:MAP_READY');
const PS_KEYS_DATA = config.get('wsports:server:KEYS_DATA');
const PS_CHAT_DATA = config.get('wsports:server:CHAT_DATA');
const PS_VOTE_DATA = config.get('wsports:server:VOTE_DATA');
const PS_PONG = config.get('wsports:server:PONG');

const oneConnection = config.get('server:oneConnection');

const VIMP = config.get('server:VIMP');
const vimp = new VIMP(config.get('game'), config.get('wsports:client'));

const auth = config.get('auth');
const cConf = config.get('client');

const sessions = {}; // { '0ff81720-e2b2-11e3-9614-018be5de670e': ws }
const IPs = {}; // { '127.0.0.1': '0ff81720-e2b2-11e3-9614-018be5de670e' }

export default server => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const address = req.socket.remoteAddress;
    const origin = req.headers.origin;
    const socketMethods = [];
    let id;
    let gameID;

    let rtt = 100; // начальное значение для клиента
    const PING_INTERVAL_MS = 3000; // интервал обновления пинга
    const RTT_ALPHA = 0.1; // сглаживание RTT
    let pingIDCounter = 0;
    const outstandingServerPings = new Map(); // { pingID: time }
    let pingTimerID = null;

    function scheduleNextPing() {
      clearTimeout(pingTimerID);

      pingTimerID = setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          pingIDCounter += 1;

          const time = performance.now();

          outstandingServerPings.set(pingIDCounter, time);
          ws.socket.send(PC_PING, pingIDCounter);
        }

        // следующий вызов этой функции
        scheduleNextPing();
      }, PING_INTERVAL_MS);
    }

    security.origin(origin, err => {
      if (err) {
        ws.close(4001);
      } else {
        ws.socket = {
          // отправляет данные
          send: (port, data) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(JSON.stringify([port, data]));
            }
          },

          // распаковывает данные
          unpack: pack => {
            try {
              return JSON.parse(pack);
            } catch (e) {
              return undefined;
            }
          },

          // закрывает соединение
          close: (code, data) => {
            ws.close(code, JSON.stringify(data));
          },
        };

        id = ws.socket.id = uuidv1();
        ws.socket.socketMethods = [
          false,
          false,
          false,
          false,
          false,
          false,
          false,
        ];

        sessions[id] = ws;

        ws.socket.socketMethods[PS_CONFIG_READY] = true;
        ws.socket.send(PC_CONFIG_DATA, cConf);
      }
    });

    // 0: config ready
    socketMethods[PS_CONFIG_READY] = err => {
      if (!err) {
        if (oneConnection && IPs[address]) {
          sessions[IPs[address]].socket.close(4002, [PC_INFORM_DATA, [1]]);
        }

        IPs[address] = id;

        waiting.check(id, empty => {
          if (empty) {
            ws.socket.socketMethods[PS_AUTH_RESPONSE] = true;
            ws.socket.send(PC_AUTH_DATA, auth);
          } else {
            waiting.add(id, data => {
              ws.socket.send(PC_INFORM_DATA, [0, data]);
            });
          }
        });
      }
      ws.socket.socketMethods[PS_CONFIG_READY] = false;
    };

    // 1: auth response
    socketMethods[PS_AUTH_RESPONSE] = data => {
      if (data && typeof data === 'object') {
        const err = validator.auth(data);

        ws.socket.send(PC_AUTH_ERRORS, err);

        if (!err) {
          ws.socket.socketMethods[PS_AUTH_RESPONSE] = false;
          ws.socket.socketMethods[PS_MAP_READY] = true;
          ws.socket.socketMethods[PS_KEYS_DATA] = true;
          ws.socket.socketMethods[PS_CHAT_DATA] = true;
          ws.socket.socketMethods[PS_VOTE_DATA] = true;
          ws.socket.socketMethods[PS_PONG] = true;

          vimp.createUser(data, ws.socket, createdId => {
            gameID = createdId;
          });

          scheduleNextPing(); // run ping
        }
      }
    };

    // 2: map ready
    socketMethods[PS_MAP_READY] = err => {
      vimp.mapReady(err, gameID);
    };

    // 3: keys data
    socketMethods[PS_KEYS_DATA] = keys => {
      if (keys) {
        vimp.updateKeys(gameID, keys);
      }
    };

    // 4: chat data
    socketMethods[PS_CHAT_DATA] = message => {
      if (typeof message === 'string') {
        vimp.pushMessage(gameID, message);
      }
    };

    // 5: vote data
    socketMethods[PS_VOTE_DATA] = data => {
      if (data) {
        vimp.parseVote(gameID, data);
      }
    };

    // 6: pong
    socketMethods[PS_PONG] = pingID => {
      const time = outstandingServerPings.get(pingID);

      if (time) {
        const newRttSample = performance.now() - time;

        rtt = rtt * (1 - RTT_ALPHA) + newRttSample * RTT_ALPHA;
        vimp.updateRTT(gameID, rtt);
        outstandingServerPings.delete(pingID);
      }
    };

    ws.on('message', data => {
      const msg = ws.socket.unpack(data);

      if (msg) {
        const socketMethod = socketMethods[msg[0]];

        if (ws.socket.socketMethods[msg[0]]) {
          socketMethod(msg[1]);
        }
      }
    });

    // обработчик закрытия соединения принимает (code, reason)
    ws.on('close', (code, reason) => {
      // Коды закрытия:
      // 4001 - origin conflict
      // 4002 - oneConnection

      if (code !== 4002) {
        delete IPs[address];
      }

      delete sessions[id];

      if (gameID) {
        vimp.removeUser(gameID);
      }

      waiting.remove(id);

      clearTimeout(pingTimerID);
      outstandingServerPings.clear();

      console.log('close');

      waiting.getNext(nextId => {
        if (nextId && sessions[nextId]) {
          sessions[nextId].socket.socketMethods[PS_AUTH_RESPONSE] = true;
          sessions[nextId].socket.send(PC_AUTH_DATA, auth);
          sessions[nextId].socket.send(PC_INFORM_DATA);
        }
      });

      waiting.createNotifyObject(notifyObject => {
        for (const p in notifyObject) {
          if (
            Object.prototype.hasOwnProperty.call(notifyObject, p) &&
            sessions[p]
          ) {
            sessions[p].socket.send(PC_INFORM_DATA, [0, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });
};
