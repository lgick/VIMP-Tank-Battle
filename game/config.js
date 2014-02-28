// regExp строкой
// dependencies пути
module.exports = {

  name: 'VIMP Tank Battle',
  version: '0.0.1',

  // ***** map ***** //
  map: {
    width: 5000,
    height: 3000,
    maxPlayer: 16,
    color: {
      t1: {
        colorA: '#DB3030',
        colorB: '#333333'
      },
      t2: {
        colorA: '#3030DB',
        colorB: '#333333'
      }
    },
    manifest: [
      {
        id: 'tiles',
        src: '/img/tiles.png',
        width: 32,
        height: 32
      }
    ]
  },

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

  // ***** dependencies ***** //
  dependencies: {
    Tank: 'tank',
    Radar: 'radar',
    Back: 'back'
  },

  // ***** user ***** //
  user: {
    // маршруты конструктор: canvas id
    routes: {
      Tank: 'vimp',
      Back: 'vimp',
      Radar: 'radar'
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
      params: ['health', 'score', 'rank']
    },
    sizeRatio: {
      vimp: 1,
      radar: 0.15
    },
    modules: ['vimp', 'radar', 'panel', 'chat']
  },

  radarScaleRatio: 20,

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
  }
};
