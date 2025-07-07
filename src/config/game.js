import maps from '../../public/maps/index.js';
import constructors from '../server/parts/index.js';

export default {
  expressions: {
    name: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
    message: '<|>|"|\'|%|;|\\(|\\)|&|\\+|-',
  },

  parts: {
    constructors, // конструкторы частей игры

    mapConstructor: 'Map', // название конструктора карт
    hitscanService: 'HitscanService', // сервис вычисления стрельбы hitscan

    friendlyFire: true, // огонь по своей команде

    models: {
      // tank
      m1: {
        // соотношение сторон танка 4:3, то есть widht: size*4, height: size*3
        size: 10,
        constructor: 'Tank',
        currentWeapon: 'w1',
      },
    },
    weapons: {
      // bullet
      w1: {
        type: 'hitscan',
        impulseMagnitude: 50, // сила импульса (кг*м/с)
        damage: 10, // урон от одного попадания
        range: 1500, // максимальная дальность выстрела (в игровых юнитах)
        fireRate: 0.2, // кулдаун между выстрелами (5 выстрелов в секунду)
        spread: 0.05, // разброс в радианах (0 для идеальной точности)
        consumption: 1, // расход патронов за один выстрел
        cameraShake: {
          intensity: 5, // сила тряски (в пикселях)
          duration: 150, // продолжительность (в миллисекундах)
        },
      },

      // bomb
      w2: {
        type: 'explosive',
        constructor: 'Bomb',
        time: 5000,
        shotOutcomeId: 'w2e', // id конструктора для детонации бомбы
        size: 32, // соотношение сторон 1:1
        fireRate: 0.1, // кулдаун между выстрелами
        damage: 30, // урон в эпицентре
        radius: 200, // радиус взрыва
        impulseMagnitude: 200000, // сила импульса
        cameraShake: {
          intensity: 25, // сила тряски (в пикселях)
          duration: 400, // продолжительность (в миллисекундах)
        },
      },
    },
  },

  maps, // карты
  currentMap: 'empty', // название карты по умолчанию
  mapsInVote: 4, // количество карт в голосовании
  mapSetId: 'c1', // дефолтный id конструкторов создания карт

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
      value: 100,
    },
    w1: {
      key: 1,
      value: 100,
    },
    w2: {
      key: 2,
      value: 50,
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
