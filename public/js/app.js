require([
  'require', 'io', 'createjs',
  'AuthModel', 'AuthView', 'AuthCtrl',
  'UserModel', 'UserView', 'UserCtrl',
  'GameModel', 'GameView', 'GameCtrl',
  'ChatModel', 'ChatView', 'ChatCtrl',
  'PanelModel', 'PanelView', 'PanelCtrl',
  'Factory'
], function (
  require, io, createjs,
  AuthModel, AuthView, AuthCtrl,
  UserModel, UserView, UserCtrl,
  GameModel, GameView, GameCtrl,
  ChatModel, ChatView, ChatCtrl,
  PanelModel, PanelView, PanelCtrl,
  Factory
) {

  var window = this
    , document = window.document
    , parseInt = window.parseInt
    , localStorage = window.localStorage

    , errWS = document.getElementById('errWS')

    , socket = io.connect('', {
        reconnect: false
      })

    , LoadQueue = createjs.LoadQueue
    , SpriteSheet = createjs.SpriteSheet
    , ticker = createjs.Ticker

    , userName
    , loader

    , user
    , chat
    , panel
    , stat
    , menu

      // контроллеры
    , CTRL = {}

      // масштабы
    , scale = {}

      // пути: полотно -> конструктор
    , paths

      // координаты
    , coords
  ;


  // создает пользователя
  function runModules(data) {
    var userModel
      , userView
      , canvasOptions = data.canvasOptions
      , displayID = data.displayID
      , cmd = data.cmd
      , menu = data.menu
      , stat = data.stat
      , keys = data.keys

      , chatModel
      , chatView
      , chatData = data.chat

      , panelModel
      , panelView
      , panelData = data.panel

      , statModel
      , statView

      , menuModel
      , menuView
    ;


    //==========================================//
    // User Module
    //==========================================//

    userModel = new UserModel({
      window: window,
      sizeOptions: canvasOptions,
      socket: socket,
      ticker: ticker
    });

    userView = new UserView(userModel, {
      window: window,
      displayID: displayID,
      cmd: document.getElementById(cmd),
      stat: document.getElementById(stat),
      menu: document.getElementById(menu)
    });

    userView.publisher.on('redraw', updateGameControllers);

    user = new UserCtrl(userModel, userView);

    // инициализация
    user.init({
      keys: keys,
      size: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    });


    //==========================================//
    // Chat Module
    //==========================================//

    chatModel = new ChatModel(chatData.params);

    chatView = new ChatView(chatModel, {
      window: window,
      chat: document.getElementById(chatData.elem)
    });

    chat = new ChatCtrl(chatModel, chatView);


    //==========================================//
    // Panel Module
    //==========================================//

    panelModel = new PanelModel();

    panelView = new PanelView(panelModel, {
      window: window,
      panel: panelData.elems
    });

    panel = new PanelCtrl(panelModel, panelView);

    panel.update(panelData.params);


    //==========================================//
    // Stat Module
    //==========================================//

    //statModel = new StatModel();

    //statView = new StatView();

    //stat = new StatCtrl();


    //==========================================//
    // Menu Module
    //==========================================//

    //menuModel = new MenuModel();

    //menuView = new MenuView();

    //menu = new MenuCtrl();
  }

  // создает экземпляр игры
  function makeGameController(canvasId) {
    var model = new GameModel()
      , view = new GameView(model, canvasId)
      , controller = new GameCtrl(model, view);

    return controller;
  }

  // обновляет полотна
  function updateGameControllers() {
    var name;

    if (!coords) {
      return;
    }

    for (name in CTRL) {
      if (CTRL.hasOwnProperty(name)) {
        CTRL[name].update(coords, scale[name]);
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
        params[i].value = window.localStorage[storage] || params[i].value || '';
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
  socket.on('parts', function (data) {
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

      // запрос маршрутизации
      socket.emit('paths');
    });
  });

  // пути
  socket.on('paths', function (data) {
    paths = data;
    // запрос пользовательских данных
    socket.emit('user');
  });

  // получение пользовательских данных
  socket.on('user', function (data) {
    var canvas
      , canvasOptions = data.canvasOptions
      , s;

    runModules(data);

    for (canvas in canvasOptions) {
      if (canvasOptions.hasOwnProperty(canvas)) {
        // создание контроллера полотна
        CTRL[canvas] = makeGameController(canvas);

        // масштаб изображения на полотне
        s = canvasOptions[canvas].scale || '1:1';
        s = s.split(':');
        scale[canvas] = parseInt(s[0], 10) / parseInt(s[1], 10);
      }
    }

    // запрос media
    socket.emit('media');
  });

  // загрузка media
  socket.on('media', function (data) {
    // загрузка графических файлов
    loader = new LoadQueue(false);
    loader.loadManifest(data.manifest);

    // событие при завершении загрузки
    loader.on("complete", function () {
      // запуск map
      socket.emit('map');
    });
  });

  // активация карты
  socket.on('map', function (data) {
    var spriteSheet = new SpriteSheet(data.spriteSheet);

    if (!spriteSheet.complete) {
      spriteSheet.addEventListener('complete', create);
    } else {
      create();
    }

    function create() {
      CTRL[paths.Map].parse(['Map'], {
        map: {
          name: data.name,
          spriteSheet: spriteSheet,
          step: data.step,
          map: data.map,
          options: data.options
        }
      }, true);

      spriteSheet.removeAllEventListeners();

      // запуск игры
      socket.emit('game');
    }
  });

  // обновление данных
  socket.on('game', function (serverData) {
    var data = serverData.data  // массив данных для отрисовки кадра игры
      , i = 0
      , len = data.length

      , constructors
      , instances
      , cache

      , constructor
      , controller
      , i2
      , len2;

    // объект персональных данных (координаты, панель, чат)
    coords = serverData.user;

    for (; i < len; i += 1) {
      constructors = data[i].constructors;
      instances = data[i].instances;
      cache = data[i].cache;

      i2 = 0;
      len2 = constructors.length;

      for (; i2 < len2; i2 += 1) {
        constructor = constructors[i2];
        controller = CTRL[paths[constructor]];

        controller.parse(constructor, instances, cache);
      }
    }

    updateGameControllers();
  });

  socket.on('test', function (x) {
    chat.add({
      name: 'System',
      text: x
    });
    console.log(x);
  });

  // вывод сообщения об ошибке соединения
  function showConnectStatus(message) {
    if (message) {
      errWS.innerHTML = message;
      errWS.style.display = 'block';
    } else {
      errWS.innerHTML = '';
      errWS.style.display = 'none';
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
