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
var socketMethods = [];

module.exports = function (server) {
  var wss = new WebSocketServer({server: server});

  wss.on('connection', function (ws) {
    var address = ws.upgradeReq.connection.remoteAddress;
    var origin = ws.upgradeReq.headers.origin;
    var id;
    var gameID;

    security.origin(origin, function (err) {
      if (err) {
        ws.close(4001);
      } else {
        ws.socket = {};

        id = ws.socket.id = uuid.v1();

        // отправляет данные
        ws.socket.send = function (name, data) {
          ws.send(JSON.stringify([name, data]));
          //ws.send(samples, {binary: true});
        };

        // закрывает соединение
        ws.socket.close = function (code, data) {
          ws.close(code, JSON.stringify(data));
        };

        // распаковывает данные
        ws.socket.unpack = function (pack) {
          return JSON.parse(pack);
        };

        sessions[id] = ws;

        addMetodsConfig();
        ws.socket.send(0, cConf);
      }
    });

    function addMetodsConfig() {
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
                  addMetodsAuth();
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
      };
    }

    function addMetodsAuth() {
      socketMethods[0] = null;

      // 1: auth response
      socketMethods[1] = function (data) {
        var err;

        if (data && typeof data === 'object') {
          err = validator.auth(data);

          ws.socket.send(2, err);

          if (!err) {
            addMetodsGame();
            game.createUser(data, ws.socket, function (id) {
              gameID = id;
            });
          }
        }
      };
    }

    function addMetodsGame() {
      socketMethods[1] = null;

      // 2: map ready
      socketMethods[2] = function (err) {
        game.mapReady(err, gameID);
      };

      // 3: keys data
      socketMethods[3] = function (data) {
        var keys;

        if (data) {
          var keys = parseInt(data, 36);

          // если преобразование в число дало число
          if (isFinite(keys)) {
            keys = keys.toString(2);
            keys = keys.slice(1);

            game.updateKeys(gameID, keys);

            ws.socket.send(10, {module: 'chat', data: data + ' (' + keys + ')'});
          }
        }
      };

      // 4: chat data
      socketMethods[4] = function (message) {
        game.addMessage(gameID, message);
        message = validator.chat(message);

        if (message) {
          // TODO: добавить в чат-лист имя игрока и сообщение
          ws.socket.send(10, {module: 'chat', data: message});
        }
      };

      // 5: vote data
      socketMethods[5] = function (data) {
        // TODO: получить данные опроса и обработать их
        // или
        // TODO: получить запрос на данные для опроса и отправить их
        // или
        // TODO: создать опрос и разослать его всем
        var users = [null, ['bob', 'jek', 'vasya', 'petya', 'vovka']];
        var vote = [
            'remap',
            [
              'Может поменяем на arena_2?',
              ['Да', 'Нет'],
              null
            ]
        ];

        if (typeof data === 'string') {
          if (data === 'users') {
            ws.socket.send(10, {module: 'vote', data: users});
          }
        } else if (typeof data === 'object') {
          ws.socket.send(10, {module: 'chat', data: JSON.stringify(data)});
        }
      };
    }

    ws.on('message', function (data) {
      var msg = ws.socket.unpack(data)
        , socketMethod = socketMethods[msg[0]];

      if (typeof socketMethod === 'function') {
        socketMethod(msg[1]);
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
          addMetodsAuth();
          sessions[id].socket.send(1, auth);
        }
      });

      waiting.createNotifyObject(function (notifyObject) {
        var p;

        for (p in notifyObject) {
          if (notifyObject.hasOwnProperty(p)) {
            sessions[p].socket.send(5, [1, notifyObject[p]]);
          }
        }
      });
    });

    ws.on('error', function (e) {
      console.log('error');
    });

  });
};
