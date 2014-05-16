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
        vote: [
          {
            vote: 'status',
            title: 'Сменить команду, статус',
            key: 'status',
            value: ['team1', 'team2', 'spectator'],
            next: null
          },
          {
            vote: 'remap',
            title: 'Предложить новую карту',
            key: 'map',
            value: ['arena', 'arena_2.0', 'berlin'],
            next: null
          },
          {
            vote: 'ban',
            title: 'Предложить забанить игрока',
            key: 'user',
            value: 'users',
            next: {
              title: 'Причина бана',
              key: 'reason',
              value: ['ЧИТЕР', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'HIPSTER'],
              next: {
                title: 'Время бана (в минутах)',
                key: 'time',
                value: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384],
                next: null
              }
            }
          }
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
  }

};
