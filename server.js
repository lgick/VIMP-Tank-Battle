// TODO: логирование в файл
// TODO: при авторизации если выбрать модель flat и поставить все цвета в #333 модель сливается в фоном
// TODO: капча на форму авторизации
// TODO: сделать рамку на радаре, отображаемую видимую область (учесть зум!!!)
// TODO: Все данные авторизации пришедшие на сервер проверять!
// TODO: проверять данные авторизации на соответствие
// TODO: проверять и экранировать символы '"&<> во всех пользовательских данных
// TODO: при изменении размеров масштаба браузера (cmd +, cmd -) игра ломается
// TODO: проверять данные при авторизаци (длину логина!!!)
// TODO: если пользователь в браузере заменит стили и вернет авторизационное окно находясь в игре. Нажмет отправить - будет 2 учетки
// TODO: чат огранить количество введенных символов
// TODO: банить голосованием (бан по ip, бан по браузеру (localStorage))
// TODO: отказ в авторизации (или добавления к нику тега (<number>)), если игрок с таким ником уже есть на сервере
// TODO: сделать все опции на клиенте (чат, радар, панель и тп) в виде модулей, которые подключать из конфиг файла

var express = require('express');
var path = require('path');


// CONFIG
var config = require('./config');

config.set('basic', require(path.join(__dirname, '/config/basic.js')));
config.set('game', require(path.join(__dirname, process.env.NODE_GAMECONF)));
config.set('basic:port', process.env.NODE_PORT);


// EXPRESS
var app = express();

app.set('views', path.join(__dirname, '/views'));
app.set('view engine', 'jade');

app.use(express.favicon(path.join(__dirname, '/public/img/favicon.ico')));
app.use(express.static(path.join(__dirname, '/public')));

require('./routes')(app);


// SERVER
var server = require('http').createServer(app);
server.listen(config.get('basic:port'));


// SOCKET.IO
var io = require('./socket')(server);
