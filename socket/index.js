var cookie = require('cookie');
var log = require('../lib/log')(module);
var usertools = require('../lib/usertools');

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

    // TODO: если авторизации не было
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
        log.info(data); // name=PIIIIIIT, team=t2
        cb(null, true);
        socket.emit('parts', parts);
      }
    });

    // пути
    socket.on('paths', function () {
      socket.emit('paths', paths);
    });

    // данные для user модели
    socket.on('user', function () {
      socket.emit('user', userConfig);
    });

    // данные media
    socket.on('media', function () {
      socket.emit('media', media);
    });

    socket.on('map', function () {
      socket.emit('map', map);
    });

    socket.on('game', function () {
      // var x = 0;
      // var f = true;

      // setInterval( function () {
      //   test.user.x = x;

      //   if (f) {
      //     x += 5;
      //   } else {
      //     x -= 5;
      //   }

      //   if (x === 1000) {
      //     f = false;
      //   }

      //   if (x === 0) {
      //     f = true;
      //   }

        socket.emit('game', test);
      // }, 30);
    });

    // получение команд
    socket.on('cmds', function (data) {
      var x = parseInt(data, 36).toString(2);
      //socket.emit('test', x);
    });

    // получение сообщений
    socket.on('chat', function (message) {
      socket.emit('test', message);
    });

    // отключение
    socket.on('disconnect', function () {
    });
  });
};
