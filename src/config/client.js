// regExp строкой
// dependencies пути
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
            colorInner: 0x275c2d,
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
      Map: ['renderer'], // Map требует сервис с ключом 'renderer'
    },
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

    displayId: ['vimp', 'radar', 'panel', 'chat'],

    // keys
    keys: {
      keySetList: [
        // spectator keyset
        {
          // next player (n)
          78: {
            key: 1 << 0,
            type: 1,
          },
          // prev player (p)
          80: {
            key: 1 << 1,
            type: 1,
          },
        },
        // game keyset
        {
          // forward (w)
          87: {
            key: 1 << 0,
          },
          // back (s)
          83: {
            key: 1 << 1,
          },
          // left (a)
          65: {
            key: 1 << 2,
          },
          // right (d)
          68: {
            key: 1 << 3,
          },
          // gCenter (u)
          85: {
            key: 1 << 4,
          },
          // gLeft (k)
          75: {
            key: 1 << 5,
          },
          // gRight (l)
          76: {
            key: 1 << 6,
          },
          // fire (j)
          74: {
            key: 1 << 7,
            type: 1,
          },
          // next weapon (n)
          78: {
            key: 1 << 8,
            type: 1,
          },
          // prev weapon (p)
          80: {
            key: 1 << 9,
            type: 1,
          },
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
            'Команда {0} полная. Ваша текущая команда: {1}',
            'Команда {0} полная. Ваш текущий статус: наблюдатель',
            'Ваша текущая команда: {0}',
            'Ваш текущий статус: наблюдатель',
            'Ваша новая команда: {0}',
            'Ваш новый статус: наблюдатель',
          ],
          // timers
          t: ['Текущая карта {0}', 'Новый раунд'],
          // vote
          v: [
            'Ваш голос принят!',
            'Карта {0} является текущей',
            'Голосование за новую карту запущено',
            'Смена карты временно недоступна',
            'Голосование завершено! Следующая карта: {0}',
            'Голосование за новую карту завершилось без результата',
          ],
          // name
          n: ['Имя некорректно', '{0} сменил имя на {1}'],
        },
      },
    },

    // panel
    panel: {
      elems: {
        time: 'panel-time',
        health: 'panel-health',
        bullet: 'panel-bullet',
        bomb: 'panel-bomb',
      },
      panels: ['time', 'health', 'bullet', 'bomb'],
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
          [['team'], ['Выбрать команду, статус', 'teams', null]],
          [['mapUser'], ['Предложить новую карту', 'maps', null]],
        ],
      },
    },
  },

  // ***** informer ***** //
  informer: [
    'Сервер полный! Ждите или зайдите позже.<br>' +
      'Максимум игроков: {0}<br>' +
      'Вы в очереди ожидающих под номером: {1}<br>',

    'Соединение прервано по причине нового подключения к серверу!',

    'Загружаю...',

    'Соединение прервано!',
  ],
};
