// regExp строкой
// dependencies пути
module.exports = {

  name: 'VIMP Tank Battle',
  version: '0.0.1',
  maxPlayer: 16,

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
          regExp: null,
          storage: null
        }
      }
    ]
  },

  // ***** parts ***** //
  parts: {
    Tank: 'tank',
    Radar: 'radar'
  },

  // ***** paths ***** //
  paths: {
    Tank: 'vimp',
    Map: 'vimp',
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
        screenRatio: 0.15,
        scale: '1:20'
      }
    },
    errWS: 'errWS',
    // chat
    chat: {
      elems: {
        box: 'chat-box',
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
    modules: ['vimp', 'radar', 'panel', 'chat'],
    // ***** keys ***** //
    keys: {
      game: {
        87: 'forward',
        83: 'back',
        65: 'left',
        68: 'right',
        72: 'gLeft',
        74: 'gRight',
        67: 'gCenter',
        75: 'fire',
        80: 'zoomPlus',
        79: 'zoomMinus',
        81: 'zoomDefault',
        78: 'nitro',
        67: 'cmd'
      },
      cmd: {
        27: 'game',
        13: 'enter',
        38: 'up',
        40: 'down'
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
    map: require('./maps/arena'),
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

  // ***** gameModel ***** //
  gameModel: {
    name: null,
    team: null,
    layer: 1,
    data: {
      x: null,
      y: null,
      scale: 1,
      rotation: null,
      gunRotation: null
    },
    panel: {
      health: 100,
      score: 0,
      rank: 10
    },
    chat: null
  },

  test: {
    user: {
      x: 400,
      y: 320
    },
    data: [
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
      }
    ]
  }

};
