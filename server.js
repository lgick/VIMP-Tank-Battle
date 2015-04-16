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

config.set('auth', require(path.join(__dirname, '/game/config/auth.js')));
config.set('server', require(path.join(__dirname, '/game/config/server.js')));
config.set('client', require(path.join(__dirname, '/game/config/client.js')));
config.set('game', require(path.join(__dirname, '/game/config/game.js')));

// время ожидания vote-модуля
config.set('client:user:vote:params:time', config.get('game:voteTime'));

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

// если задано количество игроков
if (argv.players) {
  if (typeof argv.players === 'number') {
    config.set('server:maxPlayers', argv.players);
    console.info('Limit players in server: ' + argv.players);
  } else {
    console.info('Limit players in server: ' + config.get('server:maxPlayers'));
  }
}


// EXPRESS
var app = express();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'jade');

app.use(express.favicon(path.join(__dirname, '/public/img/favicon.ico')));
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.static(path.join(__dirname, '/lib')));
app.use(express.static(path.join(__dirname, '/game')));

require('./routes')(app);


// SERVER
var server = require('http').createServer(app);
server.listen(config.get('server:port'));


// WS
var io = require('./socket')(server);
