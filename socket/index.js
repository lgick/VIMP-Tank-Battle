var WebSocketServer = require('ws').Server;
var uuid = require('uuid/v1');

var security = require('../lib/security');
var bantools = require('../lib/bantools');
var waiting = require('../lib/waiting');
var validator = require('../lib/validator');
var config = require('../lib/config');

var portConfig = config.get('server:ports:config');
var portAuth = config.get('server:ports:auth');
var portAuthErr = config.get('server:ports:authErr');
var portMap = config.get('server:ports:map');
var portShot = config.get('server:ports:shot');
var portInform = config.get('server:ports:inform');
var portClear = config.get('server:ports:clear');
var portLog = config.get('server:ports:log');

var oneConnection = config.get('server:oneConnection');

var Game = config.get('server:game');
var game = new Game(config.get('game'), config.get('server:ports'));

var auth = config.get('auth');
var cConf = config.get('client');

var sessions = {}; // { '0ff81720-e2b2-11e3-9614-018be5de670e': ws }
var IPs = {};      // { '127.0.0.1': '0ff81720-e2b2-11e3-9614-018be5de670e' }

module.exports = function (server) {
  var wss = new WebSocketServer({server: server});

  wss.on('connection', function (ws, req) {
    var address = req.connection.remoteAddress;
    var origin = req.headers.origin;
    var socketMethods = [];
    var id;
    var gameID;

    security.origin(origin, function (err) {
      if (err) {
        ws.close(4001);
      } else {
        ws.socket = {
          // отправляет данные
          send: function (port, data) {
            if (ws.readyState === 1) {
              ws.send(JSON.stringify([port, data]));
              //ws.send(samples, {binary: true});
            }
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

        id = ws.socket.id = uuid();
        ws.socket.socketMethods = [false, false, false, false, false, false];

        sessions[id] = ws;

        ws.socket.socketMethods[0] = true;
        ws.socket.send(portConfig, cConf);
      }
    });

    // 0: config ready
    socketMethods[0] = function (err) {
      if (!err) {
        if (oneConnection) {
          if (IPs[address]) {
            sessions[IPs[address]].socket.close(4002, [portInform, [2]]);
          }
        }

        IPs[address] = id;

        bantools.check(address, function (ban) {
          if (ban) {
            ws.socket.close(4003, [portInform, [0, ban]]);
          } else {
            waiting.check(id, function (empty) {
              if (empty) {
                ws.socket.socketMethods[1] = true;
                ws.socket.send(portAuth, auth);
              } else {
                waiting.add(id, function (data) {
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
    socketMethods[1] = function (data) {
      var err;

      if (data && typeof data === 'object') {
        err = validator.auth(data);

        ws.socket.send(portAuthErr, err);

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
        game.updateKeys(gameID, keys);
      }
    };

    // 4: chat data
    socketMethods[4] = function (message) {
      if (typeof message === 'string') {
        game.pushMessage(gameID, message);
      }
    };

    // 5: vote data
    socketMethods[5] = function (data) {
      if (data) {
        game.parseVote(gameID, data);

        if (typeof data === 'string') {
          if (data === 'users') {
            ws.socket.send(portLog, [null, ['b1', 'b2', 'b3']]);
          }
        } else if (typeof data === 'object') {
          ws.socket.send(portLog, ['System (vote)', JSON.stringify(data)]);
        }
      }
    };

    ws.on('message', function (data) {
      var msg = ws.socket.unpack(data)
        , socketMethod;

      if (msg) {
        socketMethod = socketMethods[msg[0]];

        if (ws.socket.socketMethods[msg[0]]) {
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
          sessions[id].socket.socketMethods[1] = true;
          sessions[id].socket.send(portAuth, auth);
          sessions[id].socket.send(portInform);
        }
      });

      waiting.createNotifyObject(function (notifyObject) {
        var p;

        for (p in notifyObject) {
          if (notifyObject.hasOwnProperty(p)) {
            sessions[p].socket.send(portInform, [1, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', function (e) {
      console.log('error');
    });

  });
};
