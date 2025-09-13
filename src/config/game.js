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
        constructor: 'Tank',
        currentWeapon: 'w1',
        // соотношение сторон танка 4:3, то есть widht: size*4, height: size*3
        size: 5,
        // коэффициент тяги (вперед)
        baseForwardForceFactor: 700,
        // коэффициент тяги (назад)
        baseReverseForceFactor: 500,
        // коэффициент желаемой интенсивности поворота (зависит от инерции)
        baseTurnTorqueFactor: 55,
        // целевая макс. скорость вперед (м/с или юнитов/с)
        maxForwardSpeed: 400,
        // целевая макс. скорость назад (м/с или юнитов/с)
        maxReverseSpeed: -200,
        // сопротивление движению
        // (чем выше значение, тем больше сопротивление)
        damping: {
          // сопротивление при движении
          linear: 3.0,
          // сопротивление вращению (при повороте)
          angular: 15.0,
        },
        // физические свойства
        fixture: {
          density: 100, // плотность (0+)
          friction: 0.1, // трение (0 - 1)
          restitution: 0, // отскок при столкновении (0 - 1)
        },
        // сила бокового сцепления (сопротивление заносу)
        // чем выше значение, тем меньше занос/скольжение
        lateralGrip: 1.0,
        // максимальный угол поворота башни
        maxGunAngle: 1.4,
        // скорость поворота башни
        gunRotationSpeed: 5.0,
        // скорость поворота башни в центр
        gunCenterSpeed: 10.0,
      },
    },
    weapons: {
      // bullet
      w1: {
        type: 'hitscan',
        impulseMagnitude: 500000, // сила импульса (кг*м/с)
        damage: 40, // урон от одного попадания
        range: 1500, // максимальная дальность выстрела (в игровых юнитах)
        fireRate: 0, // кулдаун между выстрелами (0 - отсутствует)
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
        size: 13, // соотношение сторон 1:1
        fireRate: 0, // кулдаун (0 - отсутствует)
        damage: 20, // урон в эпицентре
        radius: 200, // радиус взрыва
        impulseMagnitude: 20000000, // сила импульса
        cameraShake: {
          intensity: 30, // сила тряски (в пикселях)
          duration: 400, // продолжительность (в миллисекундах)
        },
      },
    },
  },

  maps, // карты
  mapScale: 0.3, // масштаб карт
  currentMap: 'pool_mini', // название карты по умолчанию
  mapsInVote: 4, // количество карт в голосовании
  mapSetId: 'c1', // дефолтный id конструкторов создания карт

  // таймеры (ms)
  timers: {
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

    // интервал обновления RTT (round trip time)
    rttPingInterval: 3000,

    // периодичность проверки на бездействие (30 секунд)
    idleCheckInterval: 30000,
  },

  rtt: {
    maxMissedPings: 5, // количество пропусков ответа клиента перед киком
    maxLatency: 300, // задержка ответа для кика (0.3 секунды)
  },

  // порог допустимого бездействия перед киком
  // если null — кик отключен
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
    latency: {
      key: 4,
      bodyMethod: '=',
      bodyValue: '',
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
