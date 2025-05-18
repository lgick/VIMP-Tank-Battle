import { WebSocketServer } from 'ws';
import { v1 as uuidv1 } from 'uuid';
import security from '../lib/security.js';
import waiting from '../lib/waiting.js';
import validator from '../lib/validator.js';
import config from '../lib/config.js';

// PTC (port to client)
const PTC_CONFIG_DATA = config.get('server:WSPortToClient:CONFIG_DATA');
const PTC_AUTH_DATA = config.get('server:WSPortToClient:AUTH_DATA');
const PTC_AUTH_ERRORS = config.get('server:WSPortToClient:AUTH_ERRORS');
const PTC_INFORM_DATA = config.get('server:WSPortToClient:INFORM_DATA');
const PTC_PONG = config.get('server:WSPortToClient:PONG');

// PFC (port from client)
const PFC_CONFIG_READY = config.get('server:WSPortFromClient:CONFIG_READY');
const PFC_AUTH_RESPONSE = config.get('server:WSPortFromClient:AUTH_RESPONSE');
const PFC_MAP_READY = config.get('server:WSPortFromClient:MAP_READY');
const PFC_KEYS_DATA = config.get('server:WSPortFromClient:KEYS_DATA');
const PFC_CHAT_DATA = config.get('server:WSPortFromClient:CHAT_DATA');
const PFC_VOTE_DATA = config.get('server:WSPortFromClient:VOTE_DATA');
const PFC_PING = config.get('server:WSPortFromClient:PING');

const oneConnection = config.get('server:oneConnection');

const VIMP = config.get('server:VIMP');
const vimp = new VIMP(config.get('game'), config.get('server:WSPortToClient'));

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

        ws.socket.socketMethods[PFC_CONFIG_READY] = true;
        ws.socket.socketMethods[PFC_PING] = true;
        ws.socket.send(PTC_CONFIG_DATA, cConf);
      }
    });

    // 0: config ready
    socketMethods[PFC_CONFIG_READY] = err => {
      if (!err) {
        if (oneConnection && IPs[address]) {
          sessions[IPs[address]].socket.close(4002, [PTC_INFORM_DATA, [1]]);
        }

        IPs[address] = id;

        waiting.check(id, empty => {
          if (empty) {
            ws.socket.socketMethods[PFC_AUTH_RESPONSE] = true;
            ws.socket.send(PTC_AUTH_DATA, auth);
          } else {
            waiting.add(id, data => {
              ws.socket.send(PTC_INFORM_DATA, [0, data]);
            });
          }
        });
      }
      ws.socket.socketMethods[PFC_CONFIG_READY] = false;
    };

    // 1: auth response
    socketMethods[PFC_AUTH_RESPONSE] = data => {
      if (data && typeof data === 'object') {
        const err = validator.auth(data);

        ws.socket.send(PTC_AUTH_ERRORS, err);

        if (!err) {
          ws.socket.socketMethods[PFC_AUTH_RESPONSE] = false;
          ws.socket.socketMethods[PFC_MAP_READY] = true;
          ws.socket.socketMethods[PFC_KEYS_DATA] = true;
          ws.socket.socketMethods[PFC_CHAT_DATA] = true;
          ws.socket.socketMethods[PFC_VOTE_DATA] = true;

          vimp.createUser(data, ws.socket, createdId => {
            gameID = createdId;
          });
        }
      }
    };

    // 2: map ready
    socketMethods[PFC_MAP_READY] = err => {
      vimp.mapReady(err, gameID);
    };

    // 3: keys data
    socketMethods[PFC_KEYS_DATA] = keys => {
      if (keys) {
        vimp.updateKeys(gameID, keys);
      }
    };

    // 4: chat data
    socketMethods[PFC_CHAT_DATA] = message => {
      if (typeof message === 'string') {
        vimp.pushMessage(gameID, message);
      }
    };

    // 5: vote data
    socketMethods[PFC_VOTE_DATA] = data => {
      if (data) {
        vimp.parseVote(gameID, data);
      }
    };

    // 6: ping
    socketMethods[PFC_PING] = pingData => {
      // pingData здесь - это { timestamp: clientSendTime }
      // немедленная отправка pong обратно с этим же timestamp
      ws.socket.send(PTC_PONG, { originalTimestamp: pingData.timestamp });

      console.log(
        `Server: Responded to Ping from client ${id} with originalTimestamp ${pingData.timestamp}`,
      );
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

      console.log('close');

      waiting.getNext(nextId => {
        if (nextId && sessions[nextId]) {
          sessions[nextId].socket.socketMethods[PFC_AUTH_RESPONSE] = true;
          sessions[nextId].socket.send(PTC_AUTH_DATA, auth);
          sessions[nextId].socket.send(PTC_INFORM_DATA);
        }
      });

      waiting.createNotifyObject(notifyObject => {
        for (const p in notifyObject) {
          if (
            Object.prototype.hasOwnProperty.call(notifyObject, p) &&
            sessions[p]
          ) {
            sessions[p].socket.send(PTC_INFORM_DATA, [0, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });
};
