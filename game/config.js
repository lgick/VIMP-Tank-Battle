var classUser = require('./deps/user');
var banlist = require('./deps/banlist');
var vote = require('./deps/vote');
var map = require('./maps/arena');

// regExp строкой
// dependencies пути
module.exports = {

  name: 'VIMP Tank Battle',
  version: '0.0.1',
  maxPlayer: 16,

  classUser: classUser,
  banlist: banlist,

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
        value: 't1',
        options: {
          regExp: 't1|t2',
          storage: null
        }
      }
    ]
  },

  // ***** parts ***** //
  parts: {
    Tank: 'tank',
    Bullets: 'bullets',
    Radar: 'radar'
  },

  // ***** paths ***** //
  paths: {
    Tank: 'vimp',
    Map: 'vimp',
    Bullets: 'vimp',
    Radar: 'radar'
  },

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
      params: {
        health: 100,
        score: 0,
        rank: ''
      }
    },

    // stat
    stat: {
      elems: {
        stat: 'stat'
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
      {id: 'tiles', src: '/img/tiles.png'}
    ]
  },

  // ***** map ***** //
  map: {
    name: 'arena',
    map: map,
    step: 32,
    spriteSheet: {
      images: ['/img/tiles.png'],
      frames: [
        [480, 64, 32, 32, 0],
        [0, 256, 32, 32, 0],
        [160, 0, 32, 32, 0],
        [288, 0, 32, 32, 0],
        [128, 224, 32, 32, 0],
        [0, 64, 32, 32, 0]
      ]
    },
    options: {
      width: 800,
      height: 640,
      borderColor: '#fff',
      borderThickness: 3,
      backgroundColor: '#f00'
    }
  },

  // ***** game ***** //
  game: {
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
  },

  test: {
    coords: {
      x: 64,
      y: 320
    },
    chat: null,
    panel: null,
    stat: null,
    vote: null,
    game: [
      {
        constructors: ['Tank', 'Radar'],
        instances: {
          bob: {
            layer: 1,
            team: 'team1',
            x: 64,
            y: 320,
            rotation: 0,
            gunRotation: 0
          },
          jek: {
            layer: 1,
            team: 'team2',
            x: 736,
            y: 320,
            rotation: 180,
            gunRotation: 0
          }
        },
        cache: true
      },
      {
        constructors: ['Bullets'],
        instances: {
          bob: [
            [100, 320],
            [120, 320],
            [130, 320],
            [140, 320],
            [339, 44],
            [300, 994],
            [3, 34],
            [339, 44],
            [339, 44],
            [332, 94],
            [390, 72],
            [159, 334]
          ],
          jek: [
            [683, 34],
            [230, 44],
            [100, 134],
            [8, 34],
            [360, 74],
            [50, 34],
            [190, 72],
            [10, 4],
            [100, 24]
          ]
        },
        cache: false
      }
    ]
  }

};
