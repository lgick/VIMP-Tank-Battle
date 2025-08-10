import config from './config.js';

const origin = function (requestOrigin, cb) {
  const isProduction = process.env.NODE_ENV === 'production';
  const domain = config.get('server:domain');
  const devPort = config.get('server:port');
  const devProtocol = config.get('server:protocol');

  const allowedOrigins = [
    // origin'ы для локальной разработки
    `${devProtocol}//localhost:${devPort}`,
    `${devProtocol}//127.0.0.1:${devPort}`,
  ];

  if (isProduction) {
    // в продакшене разрешен только настоящий домен по стандартному HTTPS
    // порт не требуется, так как браузер не добавляет его
    // для стандартного порта 443
    allowedOrigins.push(`https://${domain}`);
  }

  let err = null;

  if (!allowedOrigins.includes(requestOrigin)) {
    err = `Blocked connection from invalid origin: ${requestOrigin}`;
  }

  process.nextTick(() => cb(err));
};

export default {
  origin,
};
