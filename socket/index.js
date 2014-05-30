var WebSocketServer = require('ws').Server;
var uuid = require('node-uuid');

var security = require('../lib/security');
var bantools = require('../lib/bantools');
var waiting = require('../lib/waiting');
var validator = require('../lib/validator');
var config = require('../lib/config');

var oneConnection = config.get('server:oneConnection');

var Game = config.get('server:game');
var game = new Game(config.get('game'));

var auth = config.get('auth');
var cConf = config.get('client');

var sessions = {}; // { '0ff81720-e2b2-11e3-9614-018be5de670e': ws }
var IPs = {};      // { '127.0.0.1': '0ff81720-e2b2-11e3-9614-018be5de670e' }

module.exports = function (server) {
  var wss = new WebSocketServer({server: server});

  wss.on('connection', function (ws) {
    var address = ws.upgradeReq.connection.remoteAddress;
    var origin = ws.upgradeReq.headers.origin;
    var socketMethods = [];
    var id;
    var gameID;

    security.origin(origin, function (err) {
      if (err) {
        ws.close(4001);
      } else {
        ws.socket = {
          // отправляет данные
          send: function (name, data) {
            ws.send(JSON.stringify([name, data]));
            //ws.send(samples, {binary: true});
          },

          // распаковывает данные
          unpack: function (pack) {
            var res;

            try {
              res = JSON.parse(pack);
            } catch (e) {
            }

            return res;
          },

          // закрывает соединение
          close: function (code, data) {
            ws.close(code, JSON.stringify(data));
          }
        };

        id = ws.socket.id = uuid.v1();
        ws.socket.socketMethods = [false, false, false, false, false, false];

        sessions[id] = ws;

        ws.socket.socketMethods[0] = true;
        ws.socket.send(0, cConf);
      }
    });

    // 0: config ready
    socketMethods[0] = function (err) {
      if (!err) {
        if (oneConnection) {
          if (IPs[address]) {
            sessions[IPs[address]].socket.close(4002, [5, [2]]);
          }
        }

        IPs[address] = id;

        bantools.check(address, function (ban) {
          if (ban) {
            ws.socket.close(4003, [5, [0, ban]]);
          } else {
            waiting.check(id, function (empty) {
              if (empty) {
                ws.socket.socketMethods[1] = true;
                ws.socket.send(1, auth);
              } else {
                waiting.add(id, function (data) {
                  ws.socket.send(5, [1, data]);
                });
              }
            });
          }
        });
      }

      ws.socket.socketMethods[0] = false;
    };

    // 1: auth response
    socketMethods[1] = function (data) {
      var err;

      if (data && typeof data === 'object') {
        err = validator.auth(data);

        ws.socket.send(2, err);

        if (!err) {
          ws.socket.socketMethods[1] = false;
          ws.socket.socketMethods[2] = true;
          ws.socket.socketMethods[3] = true;
          ws.socket.socketMethods[4] = true;
          ws.socket.socketMethods[5] = true;

          game.createUser(data, ws.socket, function (id) {
            gameID = id;
          });
        }
      }
    };

    // 2: map ready
    socketMethods[2] = function (err) {
      game.mapReady(err, gameID);
    };

    // 3: keys data
    socketMethods[3] = function (keys) {
      if (keys) {
        keys = parseInt(keys, 36);

        // если результат преобразования число
        if (isFinite(keys)) {
          keys = keys.toString(2);
          keys = keys.slice(1);

          game.updateKeys(gameID, keys);

          ws.socket.send(10, {module: 'chat', data: keys});
        }
      }
    };

    // 4: chat data
    socketMethods[4] = function (message) {
      if (typeof message === 'string') {
        message = validator.chat(message);

        if (message) {
          game.addMessage(gameID, message);
          ws.socket.send(10, {module: 'chat', data: message});
        }
      }
    };

    // 5: vote data
    socketMethods[5] = function (data) {
      if (data) {
        game.parseVote(gameID, data);

        if (typeof data === 'string') {
          if (data === 'users') {
            ws.socket.send(10, {module: 'vote', data: [null, ['b1', 'b2', 'b3']]});
          }
        } else if (typeof data === 'object') {
          ws.socket.send(10, {module: 'chat', data: JSON.stringify(data)});
        }
      }
    };

    ws.on('message', function (data) {
      var msg = ws.socket.unpack(data)
        , socketMethod;

      if (msg) {
        socketMethod = socketMethods[msg[0]];

        if (typeof socketMethod === 'function' && ws.socket.socketMethods[msg[0]]) {
          socketMethod(msg[1]);
        }
      }
    });

    ws.on('close', function (e) {
      // e.code:
      // 4001 - origin conflict
      // 4002 - oneConnection
      // 4003 - ban

      // если закрытие вызвано не дублирующим адресом (oneConnection)
      if (e.code !== 4002) {
        delete IPs[address];
      }

      delete sessions[id];
      game.removeUser(gameID, function (success) {
        if (!success) {
        }
      });

      waiting.remove(id);

      console.log('close');

      waiting.getNext(function (id) {
        if (id) {
          if (sessions[id].readyState === 1) {
            sessions[id].socket.socketMethods[1] = true;
            sessions[id].socket.send(1, auth);
          }
        }
      });

      waiting.createNotifyObject(function (notifyObject) {
        var p;

        for (p in notifyObject) {
          if (notifyObject.hasOwnProperty(p)) {
            if (sessions[p].readyState === 1) {
              sessions[p].socket.send(5, [1, notifyObject[p]]);
            }
          }
        }
      });
    });

    ws.on('error', function (e) {
      console.log('error');
    });

  });
};
