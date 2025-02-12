import config from './config';

const protocol = config.get('server:protocol');
const domain = config.get('server:domain');
const port = config.get('server:port');

export const origin = function (origin, cb) {
  let err = null;

  if (
    origin !== `${protocol}//${domain}:${port}` &&
    origin !== `${protocol}//localhost:${port}` &&
    origin !== `${protocol}//127.0.0.1:${port}`
  ) {
    err = `${origin} this origin is not valid`;
  }

  process.nextTick(() => cb(err));
};
