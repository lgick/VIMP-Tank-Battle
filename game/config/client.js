// regExp строкой
// dependencies пути
module.exports = {

  // ***** parts ***** //
  parts: [
    {
      name: 'Map',
      path: '/parts/map.js',
      canvas: 'vimp'
    },
    {
      name: 'Tank',
      path: '/parts/tank.js',
      canvas: 'vimp'
    },
    {
      name: 'Radar',
      path: '/parts/radar.js',
      canvas: 'radar'
    },
    {
      name: 'Bullet',
      path: '/parts/bullet.js',
      canvas: 'vimp'
    }
  ],

  // ***** user ***** //
  user: {
    canvasOptions: {
      vimp: {
        aspectRatio: '3:2',
        screenRatio: 1,
        scale: '1:1'
      },
      radar: {
        aspectRatio: '1:1',
        screenRatio: 0.1,
        scale: '1:20'
      }
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
            type: 1
          },
          // prev player (p)
          80: {
            key: 1 << 1,
            type: 1
          }
        },
        // game keyset
        {
          // forward (w)
          87: {
            key: 1 << 0
          },
          // back (s)
          83: {
            key: 1 << 1
          },
          // left (a)
          65: {
            key: 1 << 2
          },
          // right (d)
          68: {
            key: 1 << 3
          },
          // gCenter (u)
          85: {
            key: 1 << 4
          },
          // gLeft (k)
          75: {
            key: 1 << 5
          },
          // gRight (l)
          76: {
            key: 1 << 6
          },
          // fire (j)
          74: {
            key: 1 << 7,
            type: 1
          }
        }
      ],
      modes: {
        67: 'chat',      // чат (c)
        77: 'vote',      // опрос (m)
        9: 'stat'        // статистика (tab)
      },
      cmds: {
        27: 'escape',    // отмена (escape)
        13: 'enter'      // ввод (enter)
      }
    },

    // chat
    chat: {
      elems: {
        chatBox: 'chat-box',
        cmd: 'cmd'
      },
      params: {
        listLimit: 5,
        lineTime: 15000,
        cacheMin: 200,
        cacheMax: 300,
        messages: {
          // teams/status
          s: [
            '{0} is full. Current team: {1}',
            'Teams is full. Current status: spectators',
            'Current team: {0}',
            'Current status: spectators',
            'Your next status: {0}',
          ],
          // timers
          t: [
            'new map',
            'next round',
          ],
          // vote
          v: [
            'Ваш голос принят!',
            'Карта {0} является текущей',
            'Голосование за новую карту запущено',
            'Смена карты временно недоступна',
            'Голосование завершено! Следующая карта: {0}',
            'Голосование за новую карту завершилось без результата',
            'Опция бана находится в разработке и {0} {1} будет вскоре наказан!'
          ]
        }
      }
    },

    // panel
    panel: {
      elems: {
        time: 'panel-time',
        health: 'panel-health'
      },
      panels: ['health']
    },

    // stat
    stat: {
      elems: {
        stat: 'stat'
      },
      params: {
        heads: {
          1: 'team1',
          2: 'team2'
        },
        bodies: {
          1: 'team1',
          2: 'team2',
          3: 'spectators',
        },
        sortList: {
          'team1': [[2, true], [3, false]],
          'team2': [[2, true], [3, false]]
        }
      }
    },

    // vote
    vote: {
      elems: {
        voteID: 'vote',
        titleClass: 'vote-title',
        listClass: 'vote-list',
        navClass: 'vote-nav',
        navActiveClass: 'active'
      },
      params: {
        menu: [
          [
            'team',
            [
              'Сменить команду, статус',
              'teams',
              null
            ]
          ],
          [
            'mapUser',
            [
              'Предложить новую карту',
              'maps',
              null
            ]
          ],
          [
            'ban',
            [
              'Предложить забанить игрока',
              'users',
              [
                'Причина бана',
                ['ЧИТЕР', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'HIPSTER'],
                [
                  'Время бана (в минутах)',
                  ['одна минута:1', 'пара минут:2', '4 minutes:4', '38 - 30:8'],
                  null
                ]
              ]
            ]
          ]
        ]
      }
    }
  },

  // ***** media ***** //
  media: {
    manifest: [
      {id: 'poster2', src: '/img/poster2.png'}
    ]
  },

  // ***** informer ***** //
  informer: [
    'Дорогой {0}, Вы забанены!<br>' +
    'Причина: {1}<br>' +
    'Время бана (час): {2}<br>' +
    'Тип бана: {3}<br>' +
    'Обжаловать бан можно на site.ru<br>',

    'Сервер полный! Пожалуйста ждите или зайдите позже!<br>' +
    'Максимум игроков: {0}<br>' +
    'Вы в очереди ожидающих под номером: {1}<br>',

    'Соединение прервано по причине нового подключения к серверу!',

    'Загружаю...',

    'Соединение прервано!'
  ]

};
