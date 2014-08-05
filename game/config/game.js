var maps = require('../maps/');

module.exports = {
  maps: maps,
  mapList: ['mini', 'arena'],
  mapTime: 1200000,              // 20 мин
  currentMap: 'arena',

  shotTime: 50,

  roundTime: 120000,             // 2 мин

  voteMapTime: 10000,            // 10 сек
  voteMapAmount: 4,              // количество карт в голосовании

  statusList: {team1: 0, team2: 1, spectators: 2}
};
