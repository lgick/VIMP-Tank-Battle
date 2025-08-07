import maps from '../../public/maps/index.js';
import constructors from '../server/parts/index.js';

export default {
  isDevMode: false, // флаг режима разработки

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
        size: 8,
        constructor: 'Tank',
        currentWeapon: 'w1',
      },
    },
    weapons: {
      // bullet
      w1: {
        type: 'hitscan',
        impulseMagnitude: 50, // сила импульса (кг*м/с)
        damage: 5, // урон от одного попадания
        range: 1500, // максимальная дальность выстрела (в игровых юнитах)
        fireRate: 0.1, // кулдаун между выстрелами (10 выстрелов в секунду)
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
        size: 15, // соотношение сторон 1:1
        fireRate: 1, // кулдаун (1 бомба в секунду)
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

  // таймеры (ms)

  // время обновления кадра ~120 Гц
  timeStep: 1000 / 120,

  // время раунда (2 минуты)
  roundTime: 120000,

  // время карты (10 минут)
  mapTime: 600000,

  // время голосования (10 секунд)
  voteTime: 10000,

  // время ожидания для запуска нового голосования смены карты (30 секунд)
  timeBlockedRemap: 30000,

  // время возможности сменить команду в начале раунда (10 секунд)
  teamChangeGracePeriod: 10000,

  // время ожидания запуска нового раунда после завершения текущего (5 секунд)
  roundRestartDelay: 5000,

  // время ожидания смены карты после голосования (2 секунды)
  mapChangeDelay: 2000,

  // периодичность проверки на бездействие (30 секунд)
  idleCheckInterval: 30000,

  // таймаут бездействия перед киком
  // если значение `null` — кик отключен
  idleKickTimeout: {
    player: 120000, // для игрока (2 минуты)
    spectator: null, // для наблюдателя
  },

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
      bodyValue: '',
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
      key: 'h',
      value: 100,
    },
    w1: {
      key: 'w1',
      value: 200,
    },
    w2: {
      key: 'w2',
      value: 50,
    },
  },

  spectatorTeam: 'spectators', // название команды наблюдателя

  teams: {
    team1: 1,
    team2: 2,
    spectators: 3,
  },

  // конфигурация клавиш наблюдателя и неактивного игрока
  spectatorKeys: {
    nextPlayer: 'nextPlayer', // next player (n)
    prevPlayer: 'prevPlayer', // prev player (p)
  },

  // конфигурация клавиш активного игрока
  // type - тип отработки нажатия на клавишу (по умолчанию 0):
  // 0 : многократное нажатие (начинается на keyDown, завершается на keyUp)
  // 1 : выполняется один раз на keyDown
  playerKeys: {
    // forward (w)
    forward: {
      key: 1 << 0,
    },
    // back (s)
    back: {
      key: 1 << 1,
    },
    // left (a)
    left: {
      key: 1 << 2,
    },
    // right (d)
    right: {
      key: 1 << 3,
    },
    // gun center (u)
    gunCenter: {
      key: 1 << 4,
      type: 1,
    },
    // gun left (k)
    gunLeft: {
      key: 1 << 5,
    },
    // gun right (l)
    gunRight: {
      key: 1 << 6,
    },
    // fire (j)
    fire: {
      key: 1 << 7,
      type: 1,
    },
    // next weapon (n)
    nextWeapon: {
      key: 1 << 8,
      type: 1,
    },
    // prev weapon (p)
    prevWeapon: {
      key: 1 << 9,
      type: 1,
    },
  },
};
