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

    , userController
    , controllers = {}

    // объект с опциями для полотна (id, deps, zoom и тп)
    , canvasOptions

    // объект с информацией на каком полотне отрисовывать конструктор
    , routes

    // координаты игрока
    , user
  ;


  // создает пользователя
  function createUser(data) {
    var userModel
      , userView
      , userCtrl
      , chat = data.chat
      , panel = data.panel
      , sizeOptions = data.sizeOptions
      , modules = data.modules
      , keys = data.keys
    ;

    userModel = new UserModel({
      chatListLimit: chat.params.listLimit || 5,
      chatLineTime: chat.params.lineTime || 15000,
      chatCacheMin: chat.params.cacheMin || 200,
      chatCacheMax: chat.params.cacheMax || 300,
      mode: 'game',
      sizeOptions: sizeOptions,
      socket: socket,
      ticker: ticker
    });

    userView = new UserView(userModel, {
      window: window,
      modules: modules,
      panel: panel.elems,
      cmd: document.getElementById(chat.elems.box),
      chatBox: document.getElementById(chat.elems.chatBox)
    });

    userView.publisher.on('redraw', updateGameControllers);

    userCtrl = new UserCtrl(userModel, userView);

    // инициализация
    userCtrl.init({
      keys: keys,
      panel: panel.params,
      size: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });

    return userCtrl;
  }

  // создает экземпляр игры
  function makeGameController(canvasId) {
    var canvas = document.getElementById(canvasId)
      , model = new GameModel()
      , view = new GameView(model, canvas)
      , controller = new GameCtrl(model, view);

    return controller;
  }

  // обновляет полотна
  function updateGameControllers() {
    var name;

    for (name in controllers) {
      if (controllers.hasOwnProperty(name)) {
        controllers[name].update(user, canvasOptions[name].zoom);
      }
    }
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
    canvasOptions = data.canvasOptions;
    routes = data.routes;
    errWS = document.getElementById(data.errWS);
    userController = createUser(data);

    var canvas;

    for (canvas in canvasOptions) {
      if (canvasOptions.hasOwnProperty(canvas)) {
        controllers[canvas] = makeGameController(canvasOptions[canvas].id);
      }
    }

    // запрос медиаданных
    socket.emit('media');
  });

  // получение медиаданных
  socket.on('media', function (data) {
    // загрузка графических файлов
    loader = new LoadQueue(false);
    loader.loadManifest(data.manifest);

    // событие при завершении загрузки
    loader.on("complete", function () {
      var tank = controllers[routes['Tank']];
      var radar = controllers[routes['Radar']];

      radar.parse(['Radar'],
        {
          bob: {
            layer: 1,
            team: 'team1',
            x: 50,
            y: 50,
            scale: 1,
            rotation: 200
          }
        }, true);

      tank.parse(['Tank'],
        {
          bob: {
            layer: 1,
            team: 'team1',
            x: 50,
            y: 50,
            scale: 1,
            rotation: 200,
            gunRotation: 0
          }
        }, true);

        user = {
          x: 50,
          y: 50,
          scale: 1
        };

        updateGameControllers();
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
      , controller
      , i2
      , len2;

    for (; i < len; i += 1) {
      constructors = data[i].constructors;
      instances = data[i].instances;
      cache = data[i].cache;

      for (i2 = 0, len2 = constructors.length; i2 < len2; i2 += 1) {
        constructor = constructors[i2];
       // controller = getInstanceGame(constructor);
       // controller.parse(constructor, instances, cache);
       // // делать по завершению!!!
       // controller.update(user);
      }
    }
  });


  // вывод сообщения о разрыве соединения
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

  // переподключение к серверу
  function reconnect() {
    socket.once('error', function () {
      window.setTimeout(reconnect, 500);
    });

    socket.socket.connect();
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
