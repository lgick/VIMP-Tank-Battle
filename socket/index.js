var log = require('../lib/log')(module);
var validator = require('../lib/validator');

var config = require('../config');

var port = config.get('basic:port');
var multipleConnections = config.get('basic:multipleConnections');

var Game = config.get('game:game');
var game = new Game();

var maxPlayers = config.get('game:maxPlayers');
var auth = config.get('game:auth');
var parts = config.get('game:parts');
var paths = config.get('game:paths');
var userConfig = config.get('game:user');
var media = config.get('game:media');
var map = config.get('game:map');

var sessions = {};
var users = {};

// tests
var testA = require('../test/testA');
var testData = require('../test/data');

module.exports = function (server) {
  var io = require('socket.io').listen(server);

  io.set('origins', 'localhost:' + port);
  io.set('logger', log);
  io.set('browser client', false);

  io.set('authorization', function (handshakeData, callback) {
    var address = handshakeData.address.address;

    if (sessions[address] && !multipleConnections) {
      io.sockets.sockets[sessions[address]].disconnect();
      callback(null, true);
    } else {
      callback(null, true);
    }
  });

  io.sockets.on('connection', function (socket) {
    var address = socket.handshake.address.address;

    sessions[address] = socket.id;

    socket.emit('auth', auth);

    // авторизация
    socket.on('auth', function (data, cb) {
      var err = validator.auth(data);

      if (err) {
        cb(err, false);
      } else {
        cb(null, true);
        users[socket.id] = game.createUser(data, socket.id, socket);
        socket.emit('deps');
      }
    });

    // запрос данных: parts
    socket.on('parts', function () {
      socket.emit('parts', parts);
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
    socket.on('ready', function () {
      game.ready(users[socket.id], true);
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
      var address = socket.handshake.address.address
        , socketID = socket.id;

      game.removeUser(users[socketID]);
      delete users[socketID];
      if (!multipleConnections) {
        delete sessions[address];
      }
    });
  });
};
