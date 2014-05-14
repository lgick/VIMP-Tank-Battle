var game = require('../game/model/game');
var banlist = require('../game/deps/banlist');
var maps = require('../game/maps/');

module.exports = {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 2,
  game: game,
  maps: maps,
  banlist: banlist,
  message: {
    ban: 'Обжаловать бан можно на site.ru'
  }
};
