var maps = require('../maps/');
var banlist = require('../deps/banlist');
var Factory = require('../../lib/factory');
var Publisher = require('../../lib/publisher');

module.exports = {
  utils: {
    Publisher: Publisher,
    Factory: Factory
  },

  banlist: banlist,

  maps: maps,                  // карты
  currentMap: 'arena',         // название карты по умолчанию
  mapsInVote: 4,               // количество карт в голосовании

  shotTime: 50,                // время обновления кадра
  roundTime: 60000,            // время раунда (60)
  mapTime: 180000,             // время карты (180)
  voteTime: 10000,             // время ожидания результатов голосования (10)
  timeBlockedRemap: 20000,     // время ожидания повторной смены карты (20)

  stat: {
    name: {
      key: 0,
      bodyMethod: 'replace',
      headSync: true,
      headMethod: 'quantity'
    },
    status: {
      key: 1,
      bodyMethod: 'replace',
      bodyValue: 'dead',
      headValue: ''
    },
    score: {
      key: 2,
      bodyMethod: 'add',
      bodyValue: 0,
      headMethod: 'add',
      headValue: 0
    },
    deaths: {
      key: 3,
      bodyMethod: 'add',
      bodyValue: 0,
      headMethod: 'add',
      headValue: 0
    }
  },

  spectatorTeam: 'spectators', // название команды наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3
  }
};
