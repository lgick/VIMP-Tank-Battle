var WebSocketServer = require('ws').Server;

var log = require('../lib/log')(module);
var security = require('../lib/security');
var bantools = require('../lib/bantools');
var waiting = require('../lib/waiting');
var validator = require('../lib/validator');
var config = require('../lib/config');

var oneConnection = config.get('server:oneConnection');

var Game = config.get('server:game');
var game = new Game();

var auth = config.get('auth');
var cConf = config.get('client');

var sessions = {};
var users = {};
var allUsers = 0;

module.exports = function (server) {
  var wss = new WebSocketServer({server: server});

  wss.on('connection', function (ws) {
    var address = ws.upgradeReq.connection.remoteAddress;
    var origin = ws.upgradeReq.headers.origin;

    ws.socket = {};

    // отправляет данные
    ws.socket.send = function (name, data) {
      console.log(ws.readyState);
      if (ws.readyState === 1) {
        ws.send(JSON.stringify([name, data]));
      }
      //ws.send(samples, {binary: true});
    };

    // распаковывает данные
    ws.socket.unpack = function (pack) {
      return JSON.parse(pack);
    };

    var socketMethods = [
      // 0: config ready
      function (err) {
        if (!err) {
          if (oneConnection) {
            if (sessions[address]) {
              sessions[address].socket.send(5, [2]);
              sessions[address].close();
            }
          }

          sessions[address] = ws;

          bantools.check(address, function (ban) {
            if (ban) {
              ws.socket.send(5, [0, ban]);
              ws.close();
            }
          });

          ws.socket.send(1, auth);
        }
      },

      // 1: auth response
      function (data) {
        var err = validator.auth(data);

        ws.socket.send(2, err);

        if (!err) {
          ws.socket.send(3, config.get('server:maps').mini);
        }
      },

      // 2: map ready
      function (err) {
        if (!err) {
        }
      },

      // 3: keys data
      function (data) {
        // TODO: добавить к сессии игрока нажатые клавиши
        var keys = parseInt(data, 36).toString(2);
        keys = keys.slice(1);
        ws.socket.send(6, {module: 'chat', data: data + ' (' + keys + ')'});
      },

      // 4: chat data
      function (message) {
        message = validator.chat(message);

        if (message) {
          // TODO: добавить в чат-лист имя игрока и сообщение
          ws.socket.send(6, {module: 'chat', data: message});
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
            ws.socket.send(6, {module: 'vote', data: users});
          }
        } else if (typeof data === 'object') {
          ws.socket.send(6, {module: 'chat', data: JSON.stringify(data)});
        }
      }
    ];

    security.origin(origin, function (err) {
      if (err) {
        ws.close();
      } else {
        ws.socket.send(0, cConf);
      }
    });

    ws.onclose = function () {
      var address = ws.upgradeReq.connection.remoteAddress;
      delete sessions[address];
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
