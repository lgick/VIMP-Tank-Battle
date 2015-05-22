// TODO: scale изменяется взависимости от разрешения экрана
// TODO: логирование в файл
// TODO: капча на форму авторизации
// TODO: сделать рамку на радаре, отображаемую видимую область (учесть зум!!!)
// TODO: если пользователь в браузере заменит стили и вернет авторизационное окно находясь в игре. Нажмет отправить - будет 2 учетки
// TODO: чат огранить количество введенных символов
// TODO: отказ в авторизации (или добавления к нику тега (<number>)), если игрок с таким ником уже есть на сервере
// TODO: бан без перезагрузки на уровне ws
// TODO: рекконект ws (дозагрузка только необходимого)
// TODO: memoryUsage control
// TODO: блокировка сообщений ws

var express = require('express');
var path = require('path');
var argv = require('minimist')(process.argv.slice(2));


// CONFIG
var config = require('./lib/config');

// auth config
config.set('auth', require(path.join(__dirname, '/game/config/auth.js')));

// server config
config.set('server', require(path.join(__dirname, '/game/config/server.js')));

// если задан домен
if (argv.domain) {
  config.set('server:domain', argv.domain);
  console.info('Domain: ' + argv.domain);
}

// если задан порт
if (argv.port) {
  config.set('server:port', argv.port);
  console.info('Port: ' + argv.port);
}

// если задано количество игроков
if (argv.players) {
  if (typeof argv.players === 'number') {
    config.set('server:maxPlayers', argv.players);
    console.info('Limit players in server: ' + argv.players);
  } else {
    console.info('Limit players in server: ' + config.get('server:maxPlayers'));
  }
}

// game config
config.set('game', require(path.join(__dirname, '/game/config/game.js')));

// если задана карта
if (argv.map) {
  // если карта существует
  if (config.get('game:maps')[argv.map]) {
    config.set('game:currentMap', argv.map);
    console.info('Current map: ' + argv.map);
  } else {
    console.info('Map ' + argv.map + ': not found');
  }
}

// если задано время раунда
if (argv.rtime) {
  if (typeof argv.rtime === 'number') {
    config.set('game:roundTime', argv.rtime);
    console.info('Round time: ' + argv.rtime);
  } else {
    console.info('Round time: ' + config.get('game:roundTime'));
  }
}

// если задано время карты
if (argv.mtime) {
  if (typeof argv.mtime === 'number') {
    config.set('game:mapTime', argv.mtime);
    console.info('Map time: ' + argv.mtime);
  } else {
    console.info('Map time: ' + config.get('game:mapTime'));
  }
}

// client config
config.set('client', require(path.join(__dirname, '/game/config/client.js')));

// время ожидания vote-модуля
config.set('client:user:vote:params:time', config.get('game:voteTime'));

// регулярное выражение для сообщений
config.set(
  'client:user:chat:params:messageExp', config.get('game:expressions:message')
);


// EXPRESS
var app = express();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'jade');

app.use(express.favicon(path.join(__dirname, '/public/img/favicon.ico')));
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.static(path.join(__dirname, '/lib')));

require('./routes')(app);


// SERVER
var server = require('http').createServer(app);
server.listen(config.get('server:port'));


// WS
var io = require('./socket')(server);
