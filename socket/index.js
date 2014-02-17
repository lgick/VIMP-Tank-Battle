var cookie = require('cookie');
var log = require('../lib/log')(module);
var config = require('../config');

var port = config.get('basic:port');
var auth = config.get('game:auth');
var mapWidth = config.get('game:map:width');
var mapHeight = config.get('game:map:height');

var users = {};

module.exports = function (server) {
  var io = require('socket.io').listen(server);

  io.set('origins', 'localhost:' + port);
  io.set('logger', log);

//  io.set('authorization', function (handshake, callback) {
//    //var c = cookie.parse(handshake.headers.cookie);
//    //console.log(c['connect.sid']);
//  });

  io.sockets.on('connection', function (socket) {
    socket.emit('auth', auth);
    // авторизация
    socket.on('auth', function (data, cb) {
      if (!data) {
        cb({auth: false});
        return;
      }

      // если имя уже есть
      // иначе
      cb({
        auth: false,
        errors: [{
          name: data.name,
          error: 'Это имя уже используется!'
        }]
      });

      log.info(data);
    });

    // получение команд
    socket.on('cmds', function (data) {
    });

    // получение сообщений
    socket.on('chat', function (message) {
    });

    // отключение
    socket.on('disconnect', function () {
    });
  });
};
