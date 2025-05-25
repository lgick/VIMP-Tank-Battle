import maps from '../../public/maps/index.js';
import constructors from '../server/parts/index.js';
import factory from '../lib/factory.js';

export default {
  factory,

  expressions: {
    name: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
    message: '<|>|"|\'|%|;|\\(|\\)|&|\\+|-',
  },

  parts: {
    mapConstructor: 'map', // название конструктора карт
    constructors, // конструкторы частей игры
    models: {
      // tank
      m1: {
        size: 10, // соотношение сторон танка 4:3, то есть widht: size*4, height: size*3
        constructor: 'tank',
        currentWeapon: 'w1',
        // боезапас модели танка
        ammo: {
          w1: 1000,
          w2: 3000,
        },
      },
    },
    weapons: {
      // bullet
      w1: {
        time: 10000,
        size: 4, // соотношение сторон 1:1
        constructor: 'bullet',
      },

      // bomb
      w2: {
        time: 5000,
        size: 32, // соотношение сторон 1:1
        constructor: 'bomb',
      },
    },
  },

  maps, // карты
  currentMap: 'empty', // название карты по умолчанию
  mapsInVote: 4, // количество карт в голосовании
  mapSetID: 'c1', // дефолтный id конструкторов создания карт

  friendlyFire: false, // огонь по своей команде

  timeStep: 1000 / 120, // время обновления кадра ~120 Гц
  roundTime: 60000, // время раунда (60)
  mapTime: 180000, // время карты (180)
  voteTime: 10000, // время ожидания результатов голосования (10)
  timeBlockedRemap: 20000, // время ожидания повторной смены карты (20)

  stat: {
    name: {
      key: 0,
      bodyMethod: '=',
      headSync: true,
      headMethod: '#',
    },
    status: {
      key: 1,
      bodyMethod: '=',
      bodyValue: 'dead',
      headValue: '',
    },
    score: {
      key: 2,
      bodyMethod: '+',
      bodyValue: 0,
      headMethod: '+',
      headValue: 0,
    },
    deaths: {
      key: 3,
      bodyMethod: '+',
      bodyValue: 0,
      headMethod: '+',
      headValue: 0,
    },
  },

  panel: {
    health: {
      key: 0,
      method: '-',
      value: 100,
      minValue: 0,
    },
    bullet: {
      key: 1,
      method: '-',
      value: 1000,
      minValue: 0,
    },
    bomb: {
      key: 2,
      method: '-',
      value: 10,
      minValue: 0,
    },
  },

  spectatorTeam: 'spectators', // название команды наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3,
  },

  spectatorKeys: {
    nextPlayer: 1 << 0,
    prevPlayer: 1 << 1,
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
    nextWeapon: 1 << 8,
    prevWeapon: 1 << 9,
  },
};
