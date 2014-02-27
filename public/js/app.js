require([
  'require', 'io', 'createjs',
  'AuthModel', 'AuthView', 'AuthCtrl',
  'UserModel', 'UserView', 'UserCtrl',
  'GameModel', 'GameView', 'GameCtrl',
  'Factory'
], function (
  require, io, createjs,
  AuthModel, AuthView, AuthCtrl,
  UserModel, UserView, UserCtrl,
  GameModel, GameView, GameCtrl,
  Factory
) {

  var window = this
    , document = window.document
    , localStorage = window.localStorage

    , socket = io.connect('', {
        reconnect: false
      })

    , LoadQueue = createjs.LoadQueue
    , ticker = createjs.Ticker

    , userName
    , errWS
    , loader
    , iterations = 0
    , vimpUserCache = null
    , radarUserCache = null

    // используется для маршрутизации данных в экземпляры игры
    , router = {}

    , userModel = null
    , userCtrl = null

    , vimpCtrl = null
    , backCtrl = null
    , radarCtrl = null
  ;


  // стартует игру
  function startGame(data) {
    var userView
      , vimpModel
      , vimpView
      , backModel
      , backView
      , radarModel
      , radarView;

    var back = document.getElementById(CANVAS_BACK_ID)
      , vimp = document.getElementById(CANVAS_VIMP_ID)
      , radar = document.getElementById(CANVAS_RADAR_ID);

    // TODO: сделать абстракцию
    var panelHealth = document.getElementById(PANEL_HEALTH_ID)
      , panelScore = document.getElementById(PANEL_SCORE_ID)
      , panelRank = document.getElementById(PANEL_RANK_ID);

    // старт user
    userModel = new UserModel({
      chatListLimit: CHAT_LIST_LIMIT,
      chatLineTime: CHAT_LINE_TIME,
      chatCacheMin: CHAT_CACHE_MIN,
      chatCacheMax: CHAT_CACHE_MAX,
      mode: 'game',
      panel: USER_PANEL,
      sizeRatio: SIZE_RATIO,
      socket: socket,
      ticker: ticker
    });

    userView = new UserView(userModel, {
      window: window,
      modules: [
        back,
        vimp,
        radar,
        document.getElementById(CHAT_ID),
        document.getElementById(PANEL_ID)
      ],
      panel: {
        health: panelHealth,
        score: panelScore,
        rank: panelRank
      },
      cmd: document.getElementById(CMD_ID),
      chatBox: document.getElementById(CHAT_BOX_ID)
    });

    userCtrl = new UserCtrl(userModel, userView);
  }

  // создает экземпляр игры
  function makeInstanceGame(canvasId) {
    var canvas = document.getElementById(canvasId)
      , model = new GameModel()
      , view = new GameView(model, canvas)
      , controller = new GameCtrl(model, view);

    return controller;
  }

  // возвращает нужный экземпляр игры
  function getInstanceGame(constructor) {
    if (router[constructor]) {
      return router[constructor];
    } else {
      console.log('router error');
    }
  }

  // отрисовывает фон игры при ресайзе
  function drawBack(data) {
  }

  // ресайз игры
  function resize(data) {
    drawBack(data);

    gameUpdateAllView();
  }

  // обновляет все представления
  function gameUpdateAllView() {
    backCtrl.update();

    vimpCtrl.update({
      user: vimpUserCache,
      width: vimp.width,
      height: vimp.height
    });

    radarCtrl.update({
      user: radarUserCache,
      ratio: RADAR_SCALE_RATIO,
      width: radar.width,
      height: radar.height
    });
  }

  // переподключение к серверу
  function reconnect() {
    socket.once('error', function () {
      window.setTimeout(reconnect, 500);
    });

    socket.socket.connect();
  }

// ДАННЫЕ С СЕРВЕРА

  // авторизация пользователя
  socket.on('auth', function (data) {
    if (typeof data !== 'object') {
      console.log('authorization error');
      return;
    }

    var viewData
      , elems = data.elems
      , params = data.params
      , authModel
      , authView
      , authCtrl
      , i = 0
      , len = params.length
      , storage
      , regExp;

    for (; i < len; i += 1) {
      storage = params[i].options.storage;
      regExp = params[i].options.regExp;

      if (storage) {
        params[i].value = window.localStorage[storage] || '';
      }

      if (regExp) {
        params[i].options.regExp = new RegExp(regExp);
      }
    }

    viewData = {
      window: window,
      auth: document.getElementById(elems.authId),
      form: document.getElementById(elems.formId),
      error: document.getElementById(elems.errorId),
      enter: document.getElementById(elems.enterId)
    };

    authModel = new AuthModel(socket);
    authView = new AuthView(authModel, viewData);
    authCtrl = new AuthCtrl(authModel, authView);

    authCtrl.init(params);
  });

  // дозагрузка зависимостей
  socket.on('deps', function (data) {
    var arr = []
      , names = []
      , p;

    for (p in data) {
      if (data.hasOwnProperty(p)) {
        names.push(p);
        arr.push(data[p]);
      }
    }

    require(arr, function () {
      var i = 0
        , len = arguments.length;

      for (; i < len; i += 1) {
        Factory.add(names[i], arguments[i]);
      }

      // запрос пользовательских данных
      socket.emit('user');
    });
  });

  // получение пользовательских данных
  socket.on('user', function (data) {
    var routes = data.routes
      , constructor;

    for (constructor in routes) {
      if (routes.hasOwnProperty(constructor)) {
        router[constructor] = makeInstanceGame(routes[constructor]);
      }
    }
  });

  // получение медиаданных
  socket.on('media', function (data) {
    // загрузка графических файлов
    loader = new LoadQueue(false);
    loader.loadManifest(data.manifest);

    // событие при завершении загрузки
    loader.on("complete", function () {
    });
  });

  // активация игры
  socket.on('model', function (data) {
  });

  // обновление данных
  socket.on('game', function (data) {
    var user = data.user  // объект персональных данных (координаты, панель, чат)
      , data = data.data  // массив данных для отрисовки кадра игры
      , i = 0
      , len = data.length
      , constructors
      , instances
      , cache
      , constructor
      , i2
      , len2;

    for (; i < len; i += 1) {
      constructors = data[i].constructors;
      instances = data[i].instances;
      cache = data[i].cache;

      for (i2 = 0, len2 = constructors.length; i2 < len2; i2 += 1) {
        constructor = constructors[i2];
        getInstanceGame(constructor).parse(constructor, instances, cache);
      }
    }
  });


  // Ошибки соединения
  function showConnectStatus(message) {
    if (errWS) {
      if (message) {
        errWS.innerHTML = message;
        errWS.style.display = 'block';
      } else {
        errWS.innerHTML = '';
        errWS.style.display = 'none';
      }
    }
  }

  socket.on('connect', function () {
    showConnectStatus();
  });

  socket.on('disconnect', function () {
    showConnectStatus('Server disconnect :(');
    window.setTimeout(reconnect, 500);
  });

  socket.on('reconnect_failed', function () {
    showConnectStatus('Server reconnect failed :(');
  });

  socket.on('connect_failed', function () {
    showConnectStatus('Server connect failed :(');
  });
});
