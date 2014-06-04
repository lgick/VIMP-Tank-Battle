var maps = require('../maps/');

module.exports = {
  shotTime: 1000,

  roundTime: 120000,             // 2 мин

  voteMapTime: 10000,            // 10 сек
  voteMapAmount: 4,

  mapList: ['mini', 'arena'],
  mapTime: 1200000,              // 20 мин

  maps: maps,
  teams: ['team1', 'team2', 'spectators']
};
