import sounds from '../../public/sounds/index.js';

export default {
  // ***** parts ***** //
  parts: {
    // распределение данных в заданные классы
    gameSets: {
      c1: ['Map', 'MapRadar'],
      c2: ['Map'],
      m1: ['Tank', 'TankRadar', 'Smoke', 'Tracks'],
      w1: ['ShotEffect'],
      w2: ['Bomb'],
      w2e: ['ExplosionEffect'],
    },
    // отображение классов на полотнах
    entitiesOnCanvas: {
      Map: 'vimp',
      MapRadar: 'radar',
      TankRadar: 'radar',
      Tank: 'vimp',
      ShotEffect: 'vimp',
      Bomb: 'vimp',
      ExplosionEffect: 'vimp',
      Smoke: 'vimp',
      Tracks: 'vimp',
    },

    // ассеты, которые должны быть "запечены" (созданы один раз) при старте игры
    bakedAssets: {
      vimp: [
        {
          // id доступа к текстуре и название функции "запекания"
          name: 'explosionTexture',
          component: 'ExplosionEffect', // компонент, которому назначен ассет
          params: {
            radius: 50, // радиус круга
            blur: 2, // сила размытия
            color: 0xffffff, // цвет (белый для удобного tinting)
          },
        },
        {
          name: 'impactParticleTexture',
          component: 'ShotEffect',
          params: {
            radius: 4,
            blur: 1,
            color: 0xffffff,
          },
        },
        {
          name: 'funnelTexture',
          component: 'ExplosionEffect',
          params: {
            baseRadius: 50,
            irregularity: 15,
            blur: 20,
            numPoints: 12,
          },
        },
        {
          name: 'smokeTexture',
          component: 'Smoke',
          params: {
            radius: 3, // базовый радиус частицы дыма
            blur: 1, // размытие для мягкости
            color: 0xffffff, // цвет для последующего tint'а
          },
        },
        {
          name: 'tankTexture',
          component: 'Tank',
          params: {
            colors: {
              teamId1: 0x552222,
              teamId2: 0x225522,
            },
          },
        },
        {
          name: 'bombTexture',
          component: 'Bomb',
          params: {
            colorOuter: 0xffffff,
            colorInner: 0x0f0f0f,
          },
        },
        {
          name: 'trackMarkTexture',
          component: 'Tracks',
          params: {
            width: 4,
            length: 5,
            color: 0x1a1a12,
          },
        },
      ],
      radar: [
        {
          name: 'tankRadarTexture',
          component: 'TankRadar',
          params: {
            radius: 6,
            borderWidth: 2,
            crossSize: 9,
            crossThickness: 1.5,
            colors: {
              teamId1: 0x552222,
              teamId2: 0x225522,
            },
          },
        },
      ],
    },

    // карта зависимостей компонентов
    componentDependencies: {
      // Map требует сервис renderer
      renderer: ['Map'],
      // компоненты использующие звук
      soundManager: ['ExplosionEffect', 'ShotEffect', 'Bomb'],
    },

    // звуковые ассеты
    sounds,
  },

  // ***** modules ***** //
  modules: {
    canvasOptions: {
      vimp: {
        aspectRatio: '3:2',
        screenRatio: 1,
        scale: '1:1',
      },
      radar: {
        fixSize: '150',
        scale: '1:13',
      },
    },

    displayIdList: ['vimp', 'radar', 'panel', 'chat'],

    // keys
    keys: {
      keySetList: [
        // spectator keyset
        {
          78: 'nextPlayer', // next player (n)
          80: 'prevPlayer', // prev player (p)
        },
        // player keyset
        {
          87: 'forward', // forward (w)
          83: 'back', // back (s)
          65: 'left', // left (a)
          68: 'right', // right (d)
          85: 'gunCenter', // gun center (u)
          75: 'gunLeft', // gun left (k)
          76: 'gunRight', // gun right (l)
          74: 'fire', // fire (j)
          78: 'nextWeapon', // next weapon (n)
          80: 'prevWeapon', // prev weapon (p)
        },
      ],
      modes: {
        67: 'chat', // чат (c)
        77: 'vote', // опрос (m)
        9: 'stat', // статистика (tab)
      },
      cmds: {
        27: 'escape', // отмена (escape)
        13: 'enter', // ввод (enter)
      },
    },

    // chat
    chat: {
      elems: {
        chatBox: 'chat-box',
        cmd: 'cmd',
      },
      params: {
        listLimit: 5,
        lineTime: 15000,
        cacheMin: 200,
        cacheMax: 300,
        messages: {
          // teams/status
          s: [
            'Team {0} is full. Your current team: {1}', // 0
            'Your team: {0}', // 1
            'Your new team: {0}', // 2
            'Your team in the next round: {0}', // 3
          ],
          // timers
          t: ['Current map: {0}', 'New round'],
          // vote
          v: [
            'Your vote has been accepted!',
            'Map {0} is now active',
            'Vote for a new map has started',
            'Map change is temporarily unavailable',
            'Vote finished! Next map: {0}',
            'Vote ended with no result',
          ],
          // name
          n: ['Invalid name', '{0} changed name to {1}'],
        },
      },
    },

    // panel
    panel: {
      elems: {
        time: 'panel-time',
        health: 'panel-health',
        weapons: {
          bullet: 'panel-bullet',
          bomb: 'panel-bomb',
        },
      },
      keys: {
        t: 'time',
        h: 'health',
        wa: 'activeWeapon',
        w1: 'bullet',
        w2: 'bomb',
      },
    },

    // stat
    stat: {
      elems: {
        stat: 'stat',
      },
      params: {
        heads: {
          1: 'team1',
          2: 'team2',
        },
        bodies: {
          1: 'team1',
          2: 'team2',
          3: 'spectators',
        },
        sortList: {
          team1: [
            [2, true],
            [3, false],
          ],
          team2: [
            [2, true],
            [3, false],
          ],
        },
      },
    },

    // vote
    vote: {
      elems: {
        voteId: 'vote',
        titleClass: 'vote-title',
        listClass: 'vote-list',
        navClass: 'vote-nav',
        navActiveClass: 'active',
      },
      params: {
        menu: [
          [['team'], ['Switch team', 'teams', null]],
          [['mapUser'], ['Suggest map', 'maps', null]],
        ],
      },
    },
  },

  // game information
  gameInform: {
    id: 'game-informer',
    list: ['{0} WINS!', 'ROUND START!', 'GAME OVER!'],
  },

  // technical information
  techInformList: [
    `Server is full! Please wait or try again later.
     Max players: {0}
     You are #{1} in the queue.
    `,

    'Connection closed due to a new login from another device!',

    'Loading...',

    'Connection lost!',

    'Kicked for inactivity.',

    'Connection terminated due to high network latency.',

    'Connection terminated due to missed network pings.',
  ],
};
