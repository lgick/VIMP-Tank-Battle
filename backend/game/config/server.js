import game from '../modules/index.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 10,
  game: game,
  invite: {
    transport: {
      service: 'gmail',
      auth: {
        user: 'noreply.vimp@gmail.com',
        pass: 'SF@d$$Saf%vvd',
      },
    },
    sender: '{name} <noreply.vimp@yandex.ru>',
    subject: '{name} - game server',
    html:
      'Приглашение посетить игровой сервер: ' +
      '<a href="{protocol}//{domain}:{port}">{name}</a> !',
  },
  ports: {
    config: 0,
    auth: 1,
    authErr: 2,
    map: 3,
    shot: 4,
    inform: 5,
    clear: 6,
    log: 7,
  },
};
