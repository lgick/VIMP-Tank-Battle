import { WebSocketServer } from 'ws';
import { v1 as uuidv1 } from 'uuid';
import security from '../../lib/security.js';
import waiting from '../../lib/waiting.js';
import validator from '../../lib/validator.js';
import config from '../../lib/config.js';

// PS (server ports): порты получения данные от сервера
const PS_CONFIG_DATA = config.get('wsports:server:CONFIG_DATA');
const PS_AUTH_DATA = config.get('wsports:server:AUTH_DATA');
const PS_AUTH_ERRORS = config.get('wsports:server:AUTH_ERRORS');
const PS_TECH_INFORM_DATA = config.get('wsports:server:TECH_INFORM_DATA');

// PC (client ports): порты получения данных от клиента
const PC_CONFIG_READY = config.get('wsports:client:CONFIG_READY');
const PC_AUTH_RESPONSE = config.get('wsports:client:AUTH_RESPONSE');
const PC_MAP_READY = config.get('wsports:client:MAP_READY');
const PC_FIRST_SHOT_READY = config.get('wsports:client:FIRST_SHOT_READY');
const PC_KEYS_DATA = config.get('wsports:client:KEYS_DATA');
const PC_CHAT_DATA = config.get('wsports:client:CHAT_DATA');
const PC_VOTE_DATA = config.get('wsports:client:VOTE_DATA');

const oneConnection = config.get('server:oneConnection');

const VIMP = config.get('server:VIMP');
const vimp = new VIMP(config.get('game'), config.get('wsports:server'));

const auth = config.get('auth');
const cConf = config.get('client');

const sessions = {}; // { '0ff81720-e2b2-11e3-9614-018be5de670e': ws }
const ips = {}; // { '127.0.0.1': '0ff81720-e2b2-11e3-9614-018be5de670e' }

export default server => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const address = req.socket.remoteAddress;
    const origin = req.headers.origin;
    const socketMethods = [];
    let id;
    let gameId;

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

        ws.socket.socketMethods[PC_CONFIG_READY] = true;
        ws.socket.send(PS_CONFIG_DATA, cConf);
      }
    });

    // 0: config ready
    socketMethods[PC_CONFIG_READY] = err => {
      if (!err) {
        if (oneConnection && ips[address]) {
          sessions[ips[address]].socket.close(4002, [PS_TECH_INFORM_DATA, [1]]);
        }

        ips[address] = id;

        waiting.check(id, empty => {
          if (empty) {
            ws.socket.socketMethods[PC_AUTH_RESPONSE] = true;
            ws.socket.send(PS_AUTH_DATA, auth);
          } else {
            waiting.add(id, arr => {
              ws.socket.send(PS_TECH_INFORM_DATA, [0, arr]);
            });
          }
        });
      }
      ws.socket.socketMethods[PC_CONFIG_READY] = false;
    };

    // 1: auth response
    socketMethods[PC_AUTH_RESPONSE] = data => {
      if (data && typeof data === 'object') {
        const err = validator.auth(data);

        ws.socket.send(PS_AUTH_ERRORS, err);

        if (!err) {
          ws.socket.socketMethods[PC_AUTH_RESPONSE] = false;
          ws.socket.socketMethods[PC_MAP_READY] = true;
          ws.socket.socketMethods[PC_FIRST_SHOT_READY] = true;
          ws.socket.socketMethods[PC_KEYS_DATA] = true;
          ws.socket.socketMethods[PC_CHAT_DATA] = true;
          ws.socket.socketMethods[PC_VOTE_DATA] = true;

          vimp.createUser(data, ws.socket, createdId => {
            gameId = createdId;
          });
        }
      }
    };

    // 2: map ready
    socketMethods[PC_MAP_READY] = () => {
      vimp.mapReady(gameId);
    };

    // 3: first shot ready
    socketMethods[PC_FIRST_SHOT_READY] = () => {
      vimp.firstShotReady(gameId);
    };

    // 4: keys data
    socketMethods[PC_KEYS_DATA] = keys => {
      if (keys) {
        vimp.updateKeys(gameId, keys);
      }
    };

    // 5: chat data
    socketMethods[PC_CHAT_DATA] = message => {
      if (typeof message === 'string') {
        vimp.pushMessage(gameId, message);
      }
    };

    // 6: vote data
    socketMethods[PC_VOTE_DATA] = data => {
      if (data) {
        vimp.parseVote(gameId, data);
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
    ws.on('close', (code, _reason) => {
      // Коды закрытия:
      // 4001 - origin conflict
      // 4002 - oneConnection

      if (code !== 4002) {
        delete ips[address];
      }

      delete sessions[id];

      if (gameId) {
        vimp.removeUser(gameId);
      }

      waiting.remove(id);

      waiting.getNext(nextId => {
        if (nextId && sessions[nextId]) {
          sessions[nextId].socket.socketMethods[PC_AUTH_RESPONSE] = true;
          sessions[nextId].socket.send(PS_AUTH_DATA, auth);
          sessions[nextId].socket.send(PS_TECH_INFORM_DATA);
        }
      });

      waiting.createNotifyObject(notifyObject => {
        for (const p in notifyObject) {
          if (Object.hasOwn(notifyObject, p) && sessions[p]) {
            sessions[p].socket.send(PS_TECH_INFORM_DATA, [0, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });
};
