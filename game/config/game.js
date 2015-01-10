var maps = require('../maps/');
var Factory = require('../../lib/factory');
var Publisher = require('../../lib/publisher');

module.exports = {
  utils: {
    Publisher: Publisher,
    Factory: Factory
  },

  map: {
    maps: maps,                  // карты
    currentMap: 'arena'          // название карты по умолчанию
  },

  time: {
    shotTime: 50,                // время обновления кадра
    roundTime: 60000,            // время раунда (1 мин)
    mapTime: 180000              // время карты (3 мин)
  },

  vote: {
    time: 10000,                 // время ожидания результатов голосования (10 сек)
    timeBlockedRemap: 20000,     // время ожидания при повторной смене карты пользователем (20 сек)
    mapsInVote: 4                // количество карт в голосовании
  },

  spectatorID: 3,                // id наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3
  }
};
