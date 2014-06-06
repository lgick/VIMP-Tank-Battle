var game = require('../model/game');
var banlist = require('../deps/banlist');
var maps = require('../maps/');

module.exports = {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 4,
  game: game,
  ports: {
    config: 0,
    auth: 1,
    authErr: 2,
    map: 3,
    shot: 4,
    stat: 5,
    chat: 6,
    vote: 7,
    inform: 8,
    clear: 9,
    log: 10
  },
  maps: maps,
  banlist: banlist,
  message: {
    ban: 'Обжаловать бан можно на site.ru'
  }
};
