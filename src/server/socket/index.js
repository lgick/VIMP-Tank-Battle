import { WebSocketServer } from 'ws';
import { v1 as uuidv1 } from 'uuid';
import security from '../../lib/security.js';
import waiting from '../../lib/waiting.js';
import { validateAuth } from '../../lib/validators.js';
import config from '../../lib/config.js';
import SocketManager from './SocketManager.js';

// PC (client ports): порты получения данных от клиента
const PC_CONFIG_READY = config.get('wsports:client:CONFIG_READY');
const PC_AUTH_RESPONSE = config.get('wsports:client:AUTH_RESPONSE');
const PC_MAP_READY = config.get('wsports:client:MAP_READY');
const PC_FIRST_SHOT_READY = config.get('wsports:client:FIRST_SHOT_READY');
const PC_KEYS_DATA = config.get('wsports:client:KEYS_DATA');
const PC_CHAT_DATA = config.get('wsports:client:CHAT_DATA');
const PC_VOTE_DATA = config.get('wsports:client:VOTE_DATA');
const PC_PONG = config.get('wsports:client:PONG');

const oneConnection = config.get('server:oneConnection');

const VIMP = config.get('server:VIMP');
const socketManager = new SocketManager(config.get('wsports:server'));
const vimp = new VIMP(config.get('game'), socketManager);

const auth = config.get('auth');
const cConf = config.get('client');

const sessions = {}; // { '0ff81720-e2b2-11e3-9614-018be5de670e': ws }
const ips = {}; // { '127.0.0.1': '0ff81720-e2b2-11e3-9614-018be5de670e' }

export default server => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const ipHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const address = ipHeader.split(',')[0].trim();
    const requestOrigin = req.headers.origin;

    // если origin вообще не пришел (это скорее всего бот)
    if (!requestOrigin) {
      ws.terminate();
      return;
    }

    security.origin(requestOrigin, err => {
      if (err) {
        console.warn(err);
        ws.close(4001, JSON.stringify(err));
        return;
      }

      const socketMethods = [];
      let gameId;

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
          // отключение всех портов
          ws.socket.socketMethods = ws.socket.socketMethods.map(() => false);
          ws.close(code, JSON.stringify(data));
        },
      };

      const id = (ws.socket.id = uuidv1());

      ws.socket.socketMethods = [
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ];

      socketManager.addUser(id, ws.socket);

      sessions[id] = ws;

      ws.socket.socketMethods[PC_CONFIG_READY] = true;
      socketManager.sendConfig(id, cConf);

      // 0: config ready
      socketMethods[PC_CONFIG_READY] = err => {
        if (!err) {
          const oldId = ips[address];

          if (oneConnection && oldId) {
            socketManager.close(oldId, 4002, 'anotherDevice');
          }

          ips[address] = id;

          waiting.check(id, empty => {
            if (empty) {
              ws.socket.socketMethods[PC_AUTH_RESPONSE] = true;
              socketManager.sendAuthData(id, auth);
            } else {
              waiting.add(id, arr => {
                socketManager.sendTechInform(id, 'fullServer', arr);
              });
            }
          });
        }

        ws.socket.socketMethods[PC_CONFIG_READY] = false;
      };

      // 1: auth response
      socketMethods[PC_AUTH_RESPONSE] = data => {
        if (data && typeof data === 'object') {
          const err = validateAuth(data, auth.params);

          socketManager.sendAuthResult(id, err);

          if (!err) {
            ws.socket.socketMethods[PC_AUTH_RESPONSE] = false;
            ws.socket.socketMethods[PC_MAP_READY] = true;
            ws.socket.socketMethods[PC_FIRST_SHOT_READY] = true;
            ws.socket.socketMethods[PC_KEYS_DATA] = true;
            ws.socket.socketMethods[PC_CHAT_DATA] = true;
            ws.socket.socketMethods[PC_VOTE_DATA] = true;
            ws.socket.socketMethods[PC_PONG] = true;

            vimp.createUser(data, id, createdId => {
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
      socketMethods[PC_KEYS_DATA] = keyEventString => {
        if (typeof keyEventString === 'string') {
          vimp.updateKeys(gameId, keyEventString);
        }
      };

      // 5: chat data
      socketMethods[PC_CHAT_DATA] = message => {
        vimp.pushMessage(gameId, message);
      };

      // 6: vote data
      socketMethods[PC_VOTE_DATA] = data => {
        if (data) {
          vimp.parseVote(gameId, data);
        }
      };

      // 7: pong
      socketMethods[PC_PONG] = pingId => {
        vimp.updateRTT(gameId, pingId);
      };

      // обработчик сообщения
      ws.on('message', data => {
        const msg = ws.socket.unpack(data);

        if (msg && ws.socket.socketMethods[msg[0]]) {
          socketMethods[msg[0]](msg[1]);
        }
      });

      // обработчик закрытия
      ws.on('close', (code, _reason) => {
        if (code !== 4002) {
          delete ips[address];
        }

        socketManager.removeUser(id, ws.socket);
        delete sessions[id];

        if (gameId) {
          vimp.removeUser(gameId);
        }

        waiting.remove(id);

        waiting.getNext(nextId => {
          if (nextId && sessions[nextId]) {
            sessions[nextId].socket.socketMethods[PC_AUTH_RESPONSE] = true;
            socketManager.sendAuthData(nextId, auth);
            socketManager.sendTechInform(nextId);
          }
        });

        waiting.createNotifyObject(notifyObject => {
          for (const id in notifyObject) {
            if (Object.hasOwn(notifyObject, id) && sessions[id]) {
              socketManager.sendTechInform(id, 'fullServer', notifyObject[id]);
            }
          }
        });
      });
    });

    // общий обработчик
    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });
};
