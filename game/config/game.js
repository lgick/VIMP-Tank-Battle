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
      bodyMethod: '=',
      headSync: true,
      headMethod: '#'
    },
    status: {
      key: 1,
      bodyMethod: '=',
      bodyValue: 'dead',
      headValue: ''
    },
    score: {
      key: 2,
      bodyMethod: '+',
      bodyValue: 0,
      headMethod: '+',
      headValue: 0
    },
    deaths: {
      key: 3,
      bodyMethod: '+',
      bodyValue: 0,
      headMethod: '+',
      headValue: 0
    }
  },

  panel: {
    health: {
      key: 0,
      method: '-',
      value: 100,
      minValue: 0
    },
    bullets: {
      key: 1,
      method: '-',
      value: 1000,
      minValue: 0
    }
  },

  spectatorTeam: 'spectators', // название команды наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3
  }
};
