import fs from 'fs';
import http from 'http';
import https from 'https';
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

// домен при запуске на продакшене для проверки
// Cross-Site WebSocket Hijacking
if (argv.domain) {
  config.set('server:domain', argv.domain);
  console.info('Domain: ' + argv.domain);
}

// переопределение порта через аргумент командной строки:
// полезно для локальной разработки, если порт 3000 занят
// в продакшене порт должен быть постоянным
// и совпадать с настройками прокси-сервера
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
    config.set('game:timers:roundTime', argv.rtime);
    console.info('Round time: ' + argv.rtime);
  } else {
    console.info('Round time: ' + config.get('game:timers:roundTime'));
  }
}

// если задано время карты
if (argv.mtime) {
  if (typeof argv.mtime === 'number') {
    config.set('game:timers:mapTime', argv.mtime);
    console.info('Map time: ' + argv.mtime);
  } else {
    console.info('Map time: ' + config.get('game:timers:mapTime'));
  }
}

// если задан параметр "огонь по команде"
if (argv.friendlyfire) {
  config.set('game:parts:friendlyFire', true);
}

// client config
config.set('client', (await import('../config/client.js')).default);

// время ожидания vote-модуля
config.set(
  'client:modules:vote:params:time',
  config.get('game:timers:voteTime'),
);

// регулярное выражение для сообщений
config.set(
  'client:modules:chat:params:messageExp',
  config.get('game:expressions:message'),
);

const isProduction = process.env.NODE_ENV === 'production';

// если задан режим разработки
if (!isProduction) {
  config.set('server:oneConnection', false);
  config.set('game:isDevMode', true);
}

// EXPRESS
const app = express();
let server;

const port = config.get('server:port');

// в продакшене обычный HTTP сервер, Nginx будет обрабатывать HTTPS
// для разработки HTTPS сервер с локальными сертификатами
if (isProduction) {
  server = http.createServer(app);
} else {
  try {
    const options = {
      key: fs.readFileSync(config.get('server:httpsOptions:key')),
      cert: fs.readFileSync(config.get('server:httpsOptions:cert')),
    };
    server = https.createServer(options, app);
  } catch (err) {
    console.error(`
      Error creating HTTPS server: ${err.message}.
      Ensure that the paths to the certificate and
      key files in config/server.js are correct and the files exist.
    `);

    process.exit(1);
  }
}

// для продакшена localhost, чтобы сервер не был доступен извне напрямую
const host = isProduction ? '127.0.0.1' : undefined;

server.listen(port, host, () => {
  const protocol = isProduction ? 'http:' : 'https:';
  const displayHost = host || 'localhost';

  console.info(`
    Server is running for ${process.env.NODE_ENV || 'development'} mode.
    Listening on ${protocol}//${displayHost}:${port}
  `);
});

const socket = (await import('./socket/index.js')).default;
socket(server);

ViteExpress.bind(app, server);
