// regExp строкой
// dependencies пути
export default {
  // ***** parts ***** //
  parts: {
    gameSets: {
      c1: ['map', 'map_radar'],
      c2: ['map'],
      m1: ['tank', 'tank_radar'],
      b1: ['bullet'],
      b2: ['bomb'],
    },
    entitiesOnCanvas: {
      map: 'vimp',
      map_radar: 'radar',
      tank_radar: 'radar',
      tank: 'vimp',
      bullet: 'vimp',
      bomb: 'vimp',
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

    displayID: ['vimp', 'radar', 'panel', 'chat'],

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
          // next bullet (n)
          78: {
            key: 1 << 8,
            type: 1,
          },
          // prev bullet (p)
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
            'Все команды полные. Ваш текущий статус: наблюдатель',
            'Ваша текущая команда: {0}',
            'Ваш текущий статус: наблюдатель',
            'Ваша новая команда: {0}',
            'Ваш новый статус: наблюдатель',
          ],
          // timers
          t: ['Новая карта {0}', 'Новый раунд'],
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
          n: ['Имя некорректно', 'Имя изменилось'],
        },
      },
    },

    // panel
    panel: {
      elems: {
        time: 'panel-time',
        health: 'panel-health',
        bullets: 'panel-bullets',
        bombs: 'panel-bombs',
      },
      panels: ['time', 'health', 'bullets', 'bombs'],
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
        voteID: 'vote',
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
    'Сервер полный! Ждите или зайдите позже!<br>' +
      'Максимум игроков: {0}<br>' +
      'Вы в очереди ожидающих под номером: {1}<br>',

    'Соединение прервано по причине нового подключения к серверу!',

    'Загружаю...',

    'Соединение прервано!',
  ],
};
