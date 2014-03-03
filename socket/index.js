var cookie = require('cookie');
var log = require('../lib/log')(module);
var config = require('../config');

var port = config.get('basic:port');
var auth = config.get('game:auth');
var deps = config.get('game:dependencies');
var userConfig = config.get('game:user');
var media = config.get('game:media');
var map = config.get('game:map');

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
        cb([{name: 'Authorization', error: 'is failed'}], false);
        return;
      }

      var errors = [];
      var params = auth.params;
      var name;
      var value;
      var regExp;

      // проверка на regExp
      for (var i = 0, len = params.length; i < len; i += 1) {
        name = params[i].name;
        value = data[name];

        if (params[i].options.regExp) {
          regExp = new RegExp(params[i].options.regExp);

          if (!regExp.test(value)) {
            errors.push({name: name, error: 'not valid' });
          }
        }
      }

      if (errors.length) {
        cb(errors, false);
      } else {
        cb(null, true);
        socket.emit('deps', deps);
      }
    });

    // данные для user модели
    socket.on('user', function () {
      socket.emit('user', userConfig);
    });

    // медиаданные
    socket.on('media', function () {
      socket.emit('media', media);
    });

    socket.on('map', function () {
      socket.emit('map', map);
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
