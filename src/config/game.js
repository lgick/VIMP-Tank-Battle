import maps from '../data/maps/index.js';
import models from '../data/models.js';
import weapons from '../data/weapons.js';

export default {
  isDevMode: false, // флаг режима разработки

  parts: {
    models,
    weapons,
    mapConstructor: 'Map', // название конструктора карт
    hitscanService: 'HitscanService', // сервис вычисления стрельбы hitscan
    friendlyFire: false, // огонь по своей команде
  },

  maps, // карты игры
  mapScale: 0.3, // масштаб карт
  currentMap: 'pool mini', // название карты по умолчанию
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

    // время ожидания для запуска нового голосования (30 секунд)
    timeBlockedVote: 30000,

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
      value: 100,
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
