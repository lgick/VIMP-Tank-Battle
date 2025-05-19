import express from 'express';
import minimist from 'minimist';
import config from '../lib/config.js';
import ViteExpress from 'vite-express';

// Парсинг аргументов командной строки
const argv = minimist(process.argv.slice(2));

// auth config
config.set('auth', (await import('../config/auth.js')).default);

// server config
config.set('server', (await import('../config/server.js')).default);

// wsports config
config.set('wsports', (await import('../config/wsports.js')).default);

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
config.set('game', (await import('../config/game.js')).default);

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
config.set('client', (await import('../config/client.js')).default);

// время ожидания vote-модуля
config.set('client:modules:vote:params:time', config.get('game:voteTime'));

// регулярное выражение для сообщений
config.set(
  'client:modules:chat:params:messageExp',
  config.get('game:expressions:message'),
);

// EXPRESS
const app = express();

const server = app.listen(config.get('server:port'), () => {
  console.info(`Server is running on port ${config.get('server:port')}`);
});

const socket = (await import('./socket/index.js')).default;
socket(server);

ViteExpress.bind(app, server);
