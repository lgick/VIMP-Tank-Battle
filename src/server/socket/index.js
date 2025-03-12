import { WebSocketServer } from 'ws';
import { v1 as uuidv1 } from 'uuid';
import security from '../lib/security.js';
import bantools from '../lib/bantools.js';
import waiting from '../lib/waiting.js';
import validator from '../lib/validator.js';
import config from '../lib/config.js';

const portConfig = config.get('server:ports:config');
const portAuth = config.get('server:ports:auth');
const portAuthErr = config.get('server:ports:authErr');
const portMap = config.get('server:ports:map');
const portShot = config.get('server:ports:shot');
const portInform = config.get('server:ports:inform');
const portMisc = config.get('server:ports:misc');
const portLog = config.get('server:ports:log');

const oneConnection = config.get('server:oneConnection');

const VIMP = config.get('server:VIMP');
const vimp = new VIMP(config.get('game'), config.get('server:ports'));

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
        ];

        sessions[id] = ws;

        ws.socket.socketMethods[0] = true;
        ws.socket.send(portConfig, cConf);
      }
    });

    // 0: config ready
    socketMethods[0] = err => {
      if (!err) {
        if (oneConnection && IPs[address]) {
          sessions[IPs[address]].socket.close(4002, [
            portInform,
            [2],
          ]);
        }

        IPs[address] = id;

        bantools.check(address, ban => {
          if (ban) {
            ws.socket.close(4003, [portInform, [0, ban]]);
          } else {
            waiting.check(id, empty => {
              if (empty) {
                ws.socket.socketMethods[1] = true;
                ws.socket.send(portAuth, auth);
              } else {
                waiting.add(id, data => {
                  ws.socket.send(portInform, [1, data]);
                });
              }
            });
          }
        });
      }
      ws.socket.socketMethods[0] = false;
    };

    // 1: auth response
    socketMethods[1] = data => {
      if (data && typeof data === 'object') {
        const err = validator.auth(data);

        ws.socket.send(portAuthErr, err);

        if (!err) {
          ws.socket.socketMethods[1] = false;
          ws.socket.socketMethods[2] = true;
          ws.socket.socketMethods[3] = true;
          ws.socket.socketMethods[4] = true;
          ws.socket.socketMethods[5] = true;

          vimp.createUser(data, ws.socket, createdId => {
            gameID = createdId;
          });
        }
      }
    };

    // 2: map ready
    socketMethods[2] = err => {
      vimp.mapReady(err, gameID);
    };

    // 3: keys data
    socketMethods[3] = keys => {
      if (keys) {
        vimp.updateKeys(gameID, keys);
      }
    };

    // 4: chat data
    socketMethods[4] = message => {
      if (typeof message === 'string') {
        vimp.pushMessage(gameID, message);
      }
    };

    // 5: vote data
    socketMethods[5] = data => {
      if (data) {
        vimp.parseVote(gameID, data);

        if (typeof data === 'string') {
          if (data === 'users') {
            ws.socket.send(portLog, [null, ['b1', 'b2', 'b3']]);
          }
        } else if (typeof data === 'object') {
          ws.socket.send(portLog, [
            'System (vote)',
            JSON.stringify(data),
          ]);
        }
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
      // 4003 - ban

      if (code !== 4002) {
        delete IPs[address];
      }

      delete sessions[id];
      vimp.removeUser(gameID, success => {
        if (!success) {
          // можно добавить обработку ошибки, если необходимо
        }
      });

      waiting.remove(id);

      console.log('close');

      waiting.getNext(nextId => {
        if (nextId && sessions[nextId]) {
          sessions[nextId].socket.socketMethods[1] = true;
          sessions[nextId].socket.send(portAuth, auth);
          sessions[nextId].socket.send(portInform);
        }
      });

      waiting.createNotifyObject(notifyObject => {
        for (const p in notifyObject) {
          if (
            Object.prototype.hasOwnProperty.call(notifyObject, p) &&
            sessions[p]
          ) {
            sessions[p].socket.send(portInform, [1, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', error => {
      console.error('WebSocket error:', error);
    });
  });
};
