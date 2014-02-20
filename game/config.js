// regExp строкой
// dependencies пути
module.exports = {

  name: 'VIMP Tank Battle',

  // ***** map ***** //
  map: {
    width: 5000,
    height: 3000,
    maxPlayer: 16,
    backImage: {
      id: 'background',
      src: '/game/img/back.jpg',
      width: 500,
      height: 500
    }
  },

  dependencies: {
    Tank: 'tank',
    Radar: 'radar'
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

  // ***** user ***** //
  user: {
    elems: {
      chat: {
        box: 'chat-box',
        cmd: 'cmd'
      },
      panel: {
        health: 'panel-health',
        score: 'panel-score',
        rank: 'panel-rank'
      }
    },
    params: {
      chat: {
        listLimit: 5,
        lineTime: 15000,
        cacheMin: 200,
        cacheMax: 300
      },
      panel: {
        health: 100,
        score: 0,
        rank: 10
      }
    }
  },
  userX: {
    name: null,
    team: null,
    constructor: null,
    data: {
      x: null,
      y: null,
      scale: 1,
      rotation: null,
      gRotation: null
    },
    panel: {
      health: 100,
      score: 0,
      rank: 10
    },
    chat: null
  },

  game: {
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
  }

};
