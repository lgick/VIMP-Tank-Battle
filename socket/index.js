var WebSocketServer = require('ws').Server;
var uuid = require('node-uuid');

var log = require('../lib/log')(module);
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

        ws.socket.send(0, cConf);
      }
    });

    var socketMethods = [
      // 0: config ready
      function (err) {
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
      },

      // 1: auth response
      function (data) {
        var err = validator.auth(data);

        ws.socket.send(2, err);

        if (!err) {
          game.createUser(data, ws.socket, function (id) {
            gameID = id;
          });
        }
      },

      // 2: map ready
      function (err) {
        game.mapReady(err, gameID);
      },

      // 3: keys data
      function (data) {
        game.updateKeys(gameID, data);
        // TODO: добавить к сессии игрока нажатые клавиши
        var keys = parseInt(data, 36).toString(2);
        keys = keys.slice(1);
        ws.socket.send(10, {module: 'chat', data: data + ' (' + keys + ')'});
      },

      // 4: chat data
      function (message) {
        game.addMessage(gameID, message);
        message = validator.chat(message);

        if (message) {
          // TODO: добавить в чат-лист имя игрока и сообщение
          ws.socket.send(10, {module: 'chat', data: message});
        }
      },

      // 5: vote data
      function (data) {
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
      }
    ];

    ws.onclose = function (e) {
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

      waiting.getNext(function (id) {
        if (id) {
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

      console.log('close');
    };

    ws.onmessage = function (event) {
      var msg = ws.socket.unpack(event.data);

      socketMethods[msg[0]](msg[1]);
    };

    ws.onerror = function () {
      console.log('error');
    };

  });
};
