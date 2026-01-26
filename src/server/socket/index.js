import { WebSocketServer } from 'ws';
import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';
import security from '../../lib/security.js';
import waiting from '../../lib/waiting.js';
import { validateAuth } from '../../lib/validators.js';
import config from '../../lib/config.js';
import SocketManager from './SocketManager.js';

// PC (client ports): порты получения данных от клиента
const PC_CONFIG_READY = config.get('wsports:client:CONFIG_READY');
const PC_AUTH_RESPONSE = config.get('wsports:client:AUTH_RESPONSE');
const PC_MODULES_READY = config.get('wsports:client:MODULES_READY');
const PC_MAP_READY = config.get('wsports:client:MAP_READY');
const PC_FIRST_EVENTS_READY = config.get('wsports:client:FIRST_EVENTS_READY');
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

const sessions = new Map(); // { gameId: ws }
const ips = {}; // { '127.0.0.1': gameId }

const gameIdGen = new BinaryGenId(ID_FORMATS.UINT8);

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

      const gameId = gameIdGen.next();
      const date = new Date().toISOString();

      console.log(`[${date}] User connected: ${address} (GameID: ${gameId})`);

      const socketMethods = [];

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

      ws.socket.socketMethods = [
        false, // CONFIG_READY
        false, // AUTH_RESPONSE
        false, // MODULES_READY
        false, // MAP_READY
        false, // FIRST_EVENTS_READY
        false, // KEYS_DATA
        false, // CHAT_DATA
        false, // VOTE_DATA
        false, // PONG
      ];

      socketManager.addUser(gameId, ws.socket);

      sessions.set(gameId, ws);

      ws.socket.socketMethods[PC_CONFIG_READY] = true;
      socketManager.sendConfig(gameId, cConf);

      // 0: config ready
      socketMethods[PC_CONFIG_READY] = err => {
        if (!err) {
          const oldGameId = ips[address];

          if (oneConnection && oldGameId) {
            socketManager.close(oldGameId, 4002, 'anotherDevice');
          }

          ips[address] = gameId;

          waiting.check(gameId, empty => {
            if (empty) {
              ws.socket.socketMethods[PC_AUTH_RESPONSE] = true;
              socketManager.sendAuthData(gameId, auth);
            } else {
              waiting.add(gameId, arr => {
                socketManager.sendTechInform(gameId, 'fullServer', arr);
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

          if (!err) {
            ws.socket.socketMethods[PC_AUTH_RESPONSE] = false;
            ws.socket.socketMethods[PC_MODULES_READY] = true;

            vimp.createUser(data, gameId);
            socketManager.sendTechInform(gameId, 'loading');
          }

          socketManager.sendAuthResult(gameId, err);
        }
      };

      // 2: modules ready
      socketMethods[PC_MODULES_READY] = () => {
        ws.socket.socketMethods[PC_MODULES_READY] = false;
        ws.socket.socketMethods[PC_MAP_READY] = true;
        ws.socket.socketMethods[PC_FIRST_EVENTS_READY] = true;
        ws.socket.socketMethods[PC_KEYS_DATA] = true;
        ws.socket.socketMethods[PC_CHAT_DATA] = true;
        ws.socket.socketMethods[PC_VOTE_DATA] = true;
        ws.socket.socketMethods[PC_PONG] = true;

        vimp.sendMap(gameId);
      };

      // 3: map ready
      socketMethods[PC_MAP_READY] = () => {
        vimp.mapReady(gameId);
      };

      // 4: first events ready
      socketMethods[PC_FIRST_EVENTS_READY] = () => {
        vimp.firstEventsReady(gameId);
      };

      // 5: keys data
      socketMethods[PC_KEYS_DATA] = keyEventString => {
        if (typeof keyEventString === 'string') {
          vimp.updateKeys(gameId, keyEventString);
        }
      };

      // 6: chat data
      socketMethods[PC_CHAT_DATA] = message => {
        vimp.pushMessage(gameId, message);
      };

      // 7: vote data
      socketMethods[PC_VOTE_DATA] = data => {
        if (data) {
          vimp.parseVote(gameId, data);
        }
      };

      // 8: pong
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
        const date = new Date().toISOString();

        console.log(
          `[${date}] User disconnected: ${address} (GameID: ${gameId})`,
        );

        if (code !== 4002) {
          delete ips[address];
        }

        socketManager.removeUser(gameId, ws.socket);
        sessions.delete(gameId);
        vimp.removeUser(gameId);
        gameIdGen.release(gameId);
        waiting.remove(gameId);

        waiting.getNext(nextGameId => {
          const session = sessions.get(nextGameId);

          if (session) {
            session.socket.socketMethods[PC_AUTH_RESPONSE] = true;
            socketManager.sendAuthData(nextGameId, auth);
            socketManager.sendTechInform(nextGameId);
          }
        });

        waiting.createNotifyObject(notifyObject => {
          for (const [nGameId, data] of notifyObject) {
            if (sessions.has(nGameId)) {
              socketManager.sendTechInform(nGameId, 'fullServer', data);
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
