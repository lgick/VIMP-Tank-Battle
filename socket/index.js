var log = require('../lib/log')(module);
var validator = require('../lib/validator');
var session = require('../lib/session');

var config = require('../config');

var port = config.get('basic:port');
var auth = config.get('game:auth');
var parts = config.get('game:parts');
var paths = config.get('game:paths');
var userConfig = config.get('game:user');
var media = config.get('game:media');
var map = config.get('game:map');

var test = config.get('game:test');

var users = {};

module.exports = function (server) {
  var io = require('socket.io').listen(server);

  io.set('origins', 'localhost:' + port);
  io.set('logger', log);

  io.sockets.on('connection', function (socket) {
    var address = socket.handshake.address;
    log.info("New connection from " + address.address + ":" + address.port);

    socket.emit('auth', auth);

    // авторизация
    socket.on('auth', function (data, cb) {
      var err = validator.auth(data);

      if (err) {
        cb(err, false);
      } else {
        cb(null, true);
        session.create();
        socket.emit('parts', parts);
      }
    });

    // запрос данных: paths
    socket.on('paths', function () {
      socket.emit('paths', paths);
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
    socket.on('start', function () {
      socket.emit('shot', test);
    });

    // получение: keys
    socket.on('keys', function (data) {
      session.update(data);
      socket.emit('test', data);
    });

    // получение: chat
    socket.on('chat', function (message) {
      session.update(message);
      socket.emit('test', message);
    });

    // получение: vote
    socket.on('vote', function (data, cb) {
      if (typeof data === 'string') {
        if (data === 'users') {
          cb(['bob', 'jek', 'vasya', 'petya', 'vovka']);
        }
      } else if (typeof data === 'object') {
        socket.emit('test', JSON.stringify(data));
      }
    });

    // отключение
    socket.on('disconnect', function () {
      session.remove();
    });
  });
};
