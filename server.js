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


// CONFIG
var config = require('./lib/config');

config.set('auth', require(path.join(__dirname, '/game/config/auth.js')));
config.set('server', require(path.join(__dirname, '/game/config/server.js')));
config.set('client', require(path.join(__dirname, '/game/config/client.js')));
config.set('game', require(path.join(__dirname, '/game/config/game.js')));


// EXPRESS
var app = express();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'jade');

app.use(express.favicon(path.join(__dirname, '/public/img/favicon.ico')));
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.static(path.join(__dirname, '/game')));

require('./routes')(app);


// SERVER
var server = require('http').createServer(app);
server.listen(config.get('server:port'));


// SOCKET.IO
var io = require('./socket')(server);
