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
      keySet: {
        87: 1 << 0,    // forward (w)
        83: 1 << 1,    // back (s)
        65: 1 << 2,    // left (a)
        68: 1 << 3,    // right (d)
        85: 1 << 4,    // gCenter (u)
        75: 1 << 5,    // gLeft (k)
        76: 1 << 6,    // gRight (l)
        74: 1 << 7,    // fire (j)
        78: 1 << 8,    // next player (n)
        80: 1 << 9     // prev player (p)
      },
      modes: {
        67: 'chat',    // чат (c)
        77: 'vote',    // опрос (m)
        9: 'stat'      // статистика (tab)
      },
      cmds: {
        27: 'escape',  // отмена (escape)
        13: 'enter'    // ввод (enter)
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
        messageList: [
          '{0} is full. Current team: {1}',
          'Teams is full. Current status: spectators',
          'Current team: {0}',
          'Current status: spectators',
          'Your next status: {0}',
          'new map',
          'next round'
        ]
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
            'status',
            [
              'Сменить команду, статус',
              ['team1', 'team2', 'spectators'],
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
              ['bob', 'john', 'bill'],
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
        ],
        time: 10000
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
    '{4}<br>',


    'Сервер полный! Пожалуйста ждите или зайдите позже!<br>' +
    'Максимум игроков: {0}<br>' +
    'Вы в очереди ожидающих под номером: {1}<br>',

    'Соединение прервано по причине нового подключения к серверу!',

    'Загружаю...',

    'Соединение прервано!'
  ]

};
