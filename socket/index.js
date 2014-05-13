var log = require('../lib/log')(module);

var bantools = require('../lib/bantools');
var waiting = require('../lib/waiting');
var validator = require('../lib/validator');

var config = require('../config');

var port = config.get('basic:port');
var oneConnection = config.get('basic:oneConnection');

var Game = config.get('game:game');
var game = new Game();

var auth = config.get('game:auth');
var parts = config.get('game:parts');
var userConfig = config.get('game:user');
var media = config.get('game:media');
var map = config.get('game:map');

var sessions = {};
var users = {};
var allUsers = 0;

module.exports = function (server) {
  var io = require('socket.io').listen(server);

  io.set('origins', 'localhost:' + port);
  io.set('logger', log);
  io.set('browser client', false);

  io.set('authorization', function (handshakeData, callback) {
    var address = handshakeData.address.address;

    if (oneConnection) {
      if (sessions[address]) {
        io.sockets.sockets[sessions[address]].disconnect();
      }
    }

    callback(null, true);
    allUsers += 1;
  });

  io.sockets.on('connection', function (socket) {
    var address = socket.handshake.address.address;

    bantools.check(address, function (ban) {
      if (ban) {
        socket.emit('ban', ban);

        //setTimeout( function () {
        //  socket.disconnect();
        //}, 10000);
      } else {
        socket.emit('deps');
      }
    });

    // запрос данных: parts
    socket.on('parts', function () {
      socket.emit('parts', parts);
    });

    // запрос данных: user
    socket.on('user', function () {
      socket.emit('user', userConfig);
    });

    // запрос данных: media
    socket.on('media', function () {
      socket.emit('media', media);
    });

    // запрос данных: map
    socket.on('map', function () {
      socket.emit('map', map);
    });

    // запрос данных: game
    socket.on('ready', function () {
      waiting.check(allUsers, function (bool) {
        if (bool) {
          log.warn('waiting.check: wait === true');
          waiting.add(socket.id, function (data) {
            socket.emit('full_server', data);
          });
        } else {
          log.warn('waiting.check: wait === false');
          sessions[address] = socket.id;
          socket.emit('auth', auth);
        }
      });

    });

    // авторизация
    socket.on('auth', function (data, cb) {
      var err = validator.auth(data);

      if (err) {
        cb(err, false);
      } else {
        cb(null, true);

        game.createUser(data, socket, function (userID) {
          users[socket.id] = userID;
        });
      }
    });

    // получение: keys
    socket.on('keys', function (data) {
      // TODO: добавить к сессии игрока нажатые клавиши
      var keys = parseInt(data, 36).toString(2);
      keys = keys.slice(1);
      socket.emit('test', {module: 'chat', data: data + ' (' + keys + ')'});
    });

    // получение: chat
    socket.on('chat', function (message) {
      message = validator.chat(message);

      if (message) {
        // TODO: добавить в чат-лист имя игрока и сообщение
        io.sockets.emit('test', {module: 'chat', data: message});
      }
    });

    // получение: vote
    socket.on('vote', function (data, cb) {
      // TODO: получить данные опроса и обработать их
      // или
      // TODO: получить запрос на данные для опроса и отправить их
      // или
      // TODO: создать опрос и разослать его всем
      if (typeof data === 'string') {
        if (data === 'users') {
          cb(['bob', 'jek', 'vasya', 'petya', 'vovka']);
        }
      } else if (typeof data === 'object') {
        socket.emit('test', {module: 'chat', data: JSON.stringify(data)});
      }
    });

    // отключение
    socket.on('disconnect', function () {
      // удаляет пользователя, проверяет лист ожидающих, подключает их
      var address = socket.handshake.address.address
        , socketID = socket.id;

      allUsers -= 1;

      game.removeUser(users[socketID], function (bool) {
        if (bool) {
          delete users[socketID];
        }
      });

      if (oneConnection) {
        if (sessions[address]) {
          delete sessions[address];
        }
      }

      waiting.remove(socketID);

      // если кто-то есть в очереди, впустить его в игру
      waiting.getNext(allUsers, function (socketID) {
        var socket;

        if (socketID) {
          io.sockets.socket(socketID).emit('auth', auth);
          //socket = io.sockets.socket(socketID);
          //sockets.emit('auth', auth);
          //sessions[socket.handshake.address.address] = socketID;
        }
      });

      waiting.createNotifyObject(function (notifyObject) {
        var p;

        for (p in notifyObject) {
          if (notifyObject.hasOwnProperty(p)) {
            io.sockets.socket(p).emit('full_server', notifyObject[p]);
          }
        }
      });
    });
  });
};
