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
      name: 'Bullets',
      path: '/parts/bullets.js',
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
      keys: [
        87,  // forward (w)
        83,  // back (s)
        65,  // left (a)
        68,  // right (d)
        85,  // gCenter (u)
        75,  // gLeft (k)
        76,  // gRight (l)
        74,  // fire (j)
        78,  // next player (n)
        80   // prev player (p)
      ],
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
        cacheMax: 300
      }
    },

    // panel
    panel: {
      elems: {
        health: 'panel-health',
        score: 'panel-score',
        rank: 'panel-rank'
      },
      routes: ['health', 'score', 'rank']
    },

    // stat
    stat: {
      elems: {
        stat: 'stat'
      },
      params: {
        tables: ['team1', 'team2', 'spectators'],
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
              ['team1', 'team2', 'spectator'],
              null
            ]
          ],
          [
            'remap',
            [
              'Предложить новую карту',
              ['arena', 'arena_2.0', 'berlin'],
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
                  [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384],
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
    'Дорогой #0, Вы забанены!<br>' +
    'Причина: #1<br>' +
    'Время бана (час): #2<br>' +
    'Тип бана: #3<br>' +
    '#4<br>',


    'Сервер полный! Пожалуйста ждите или зайдите позже!<br>' +
    'Максимум игроков: #0<br>' +
    'Вы в очереди ожидающих под номером: #1<br>',

    'Соединение прервано по причине нового подключения к серверу!'
  ]

};