import express from 'express';
import favicon from 'serve-favicon';
import path from 'path';
import minimist from 'minimist';
import config from './lib/config.js';
import routes from './routes/index.js';
import socket from './socket/index.js';
import http from 'http';

// Парсинг аргументов командной строки
const argv = minimist(process.argv.slice(2));

// auth config
config.set(
  'auth',
  await import(path.join(__dirname, '/game/config/auth.js')).then(
    mod => mod.default,
  ),
);

// server config
config.set(
  'server',
  await import(path.join(__dirname, '/game/config/server.js')).then(
    mod => mod.default,
  ),
);

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
config.set(
  'game',
  await import(path.join(__dirname, '/game/config/game.js')).then(
    mod => mod.default,
  ),
);

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
config.set(
  'client',
  await import(path.join(__dirname, '/game/config/client.js')).then(
    mod => mod.default,
  ),
);

// время ожидания vote-модуля
config.set('client:user:vote:params:time', config.get('game:voteTime'));

// регулярное выражение для сообщений
config.set(
  'client:user:chat:params:messageExp',
  config.get('game:expressions:message'),
);

// EXPRESS
const app = express();
//app.set('views', path.join(__dirname, '/views'));
//app.set('view engine', 'pug');
app.use(favicon(path.join(__dirname, 'public', '/img/favicon.ico')));
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.static(path.join(__dirname, '/lib')));
routes(app);

// SERVER
const server = http.createServer(app);
server.listen(config.get('server:port'), () => {
  console.info(`Server is running on port ${config.get('server:port')}`);
});

// WS
const io = socket(server);
