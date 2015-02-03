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

  map: {
    maps: maps,                  // карты
    currentMap: 'arena'          // название карты по умолчанию
  },

  time: {
    shotTime: 50,                // время обновления кадра
    roundTime: 60000,            // время раунда (60)
    mapTime: 180000              // время карты (180)
  },

  vote: {
    time: 10000,                 // время ожидания результатов голосования (10)
    timeBlockedRemap: 20000,     // время ожидания повторной смены карты (20)
    mapsInVote: 4                // количество карт в голосовании
  },

  spectatorTeam: 'spectators',   // название команды наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3
  }
};
