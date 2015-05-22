var game = require('../modules');

module.exports = {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 10,
  game: game,
  invite: {
    transport: {
      host: 'smtp.yandex.ru',
      port: 465,
      secure: true,
      auth: {
        user: 'noreply.vimp',
        pass: '4rfv5tgb'
      }
    },
    sender: '{name} <noreply.vimp@yandex.ru>',
    subject: '{name} - game server',
    html: 'Приглашение посетить игровой сервер: ' +
      '<a href="{protocol}//{domain}:{port}">{name}</a> !'
  },
  ports: {
    config: 0,
    auth: 1,
    authErr: 2,
    map: 3,
    shot: 4,
    inform: 5,
    clear: 6,
    log: 7
  }
};
