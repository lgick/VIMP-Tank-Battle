var maps = require('../parts/maps/');
var constructors = require('../constructors/');
var models = require('../parts/models/');
var bullets = require('../parts/bullets/');
var banlist = require('../deps/banlist');
var factory = require('../../lib/factory');
var publisher = require('../../lib/publisher');

module.exports = {
  utils: {
    publisher: publisher,
    factory: factory
  },

  expressions: {
    name: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
    message: '<|>|"|\'|%|;|\\(|\\)|&|\\+|-'
  },

  constructors: constructors,
  models: models,
  bullets: bullets,

  banlist: banlist,

  maps: maps,                  // карты
  currentMap: 'arena',         // название карты по умолчанию
  mapsInVote: 4,               // количество карт в голосовании
  mapSetID: 0,                 // дефолтный id конструктора создания карты

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
  },

  defaultBullet: {
    m1: 'b1',
    m2: 'b2'
  },

  spectatorKeys: {
    nextPlayer: 1 << 0,
    prevPlayer: 1 << 1
  },

  keys: {
    forward: 1 << 0,
    back: 1 << 1,
    left: 1 << 2,
    right: 1 << 3,
    gCenter: 1 << 4,
    gLeft: 1 << 5,
    gRight: 1 << 6,
    fire: 1 << 7,
    nextBullet: 1 << 8,
    prevBullet: 1 << 9
  }
};
