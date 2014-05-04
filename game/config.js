var game = require('./model/game');
var banlist = require('./deps/banlist');
var vote = require('./deps/vote');
var map = require('./maps/mini');

// regExp строкой
// dependencies пути
module.exports = {

  name: 'VIMP Tank Battle',
  version: '0.0.1',

  game: game,
  banlist: banlist,
  maxPlayers: 8,

  banmsg: 'Обжаловать бан можно на site.ru',

  // ***** authorization ***** //
  auth: {
    elems: {
      authId: 'auth',
      formId: 'auth-form',
      errorId: 'auth-error',
      enterId: 'auth-enter'
    },
    params: [
      {
        name: 'name',
        value: '',
        options: {
          regExp: '^[a-zA-Z]([\\w\\s#]{0,13})[\\w]{1}$',
          storage: 'userName'
        }
      },
      {
        name: 'team',
        value: '0',
        options: {
          regExp: '0|1|2',
          storage: null
        }
      }
    ]
  },

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
        vote: vote,
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

  // ***** map ***** //
  map: map,

  // ***** game ***** //
  gameModel: {
    model: {
      name: null,
      team: null,
      layer: 1,
      data: {
        x: null,
        y: null,
        scale: 1,
        rotation: null,
        gunRotation: 0
      },
      panel: {
        health: 100,
        score: 0,
        rank: 10
      },
      chat: null
    },
    respawn: {
      team1: {},
      team2: {}
    },
    actions: [
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      []
    ]
  }

};
