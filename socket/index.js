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

  wss.on('connection', function (socket) {
    var address = socket.upgradeReq.connection.remoteAddress;
    var origin = socket.upgradeReq.headers.origin;
    var socketMethods = [];

    sending(1, cConf);

    // config ready
    socketMethods[0] = function (err) {
      if (!err) {
        sending(3, auth);
      }
    };

    // auth response
    socketMethods[1] = function (data) {
      var err = validator.auth(data);

      sending(4, err);

      if (!err) {
        sending(5, config.get('server:maps').mini);
      }
    };

    // map ready
    socketMethods[2] = function (err) {
      if (!err) {
      }
    };

    // keys data
    socketMethods[3] = function (data) {
      // TODO: добавить к сессии игрока нажатые клавиши
      var keys = parseInt(data, 36).toString(2);
      keys = keys.slice(1);
      sending(7, {module: 'chat', data: data + ' (' + keys + ')'});
    };

    // chat data
    socketMethods[4] = function (message) {
      message = validator.chat(message);

      if (message) {
        // TODO: добавить в чат-лист имя игрока и сообщение
        sending(7, {module: 'chat', data: message});
      }
    };

    // vote data
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
          sending(7, {module: 'vote', data: users});
        }
      } else if (typeof data === 'object') {
        sending(7, {module: 'chat', data: JSON.stringify(data)});
      }
    };

    // отправляет данные
    function sending(name, data) {
      socket.send(JSON.stringify([name, data]));
    }

    // распаковывает данные
    function unpacking(pack) {
      return JSON.parse(pack);
    }

    socket.onerror = function () {
      console.log('error');
    };

    socket.onclose = function () {
      console.log('close');
    };

    socket.onmessage = function (event) {
      var msg = unpacking(event.data);

      socketMethods[msg[0]](msg[1]);
    };

  });
};
