require([
  'require', 'io', 'createjs',
  'AuthModel', 'AuthView', 'AuthCtrl',
  'UserModel', 'UserView', 'UserCtrl',
  'GameModel', 'GameView', 'GameCtrl',
  'ChatModel', 'ChatView', 'ChatCtrl',
  'PanelModel', 'PanelView', 'PanelCtrl',
  'StatModel', 'StatView', 'StatCtrl',
  'VoteModel', 'VoteView', 'VoteCtrl',
  'Factory'
], function (
  require, io, createjs,
  AuthModel, AuthView, AuthCtrl,
  UserModel, UserView, UserCtrl,
  GameModel, GameView, GameCtrl,
  ChatModel, ChatView, ChatCtrl,
  PanelModel, PanelView, PanelCtrl,
  StatModel, StatView, StatCtrl,
  VoteModel, VoteView, VoteCtrl,
  Factory
) {

  var window = this
    , document = window.document
    , parseInt = window.parseInt
    , RegExp = window.RegExp
    , localStorage = window.localStorage

    , informer = document.getElementById('informer')

    , socket = io.connect('', {
        'reconnection delay': 500,
        'reconnection limit': 500,
        'max reconnection attempts': 1000
    })

    , LoadQueue = createjs.LoadQueue
    , SpriteSheet = createjs.SpriteSheet
    , ticker = createjs.Ticker

    , userName
    , loader

    , modules = {}

      // контроллеры
    , CTRL = {}

      // масштабы
    , scale = {}

      // данные конструкторов
    , parts

      // координаты
    , coords = {}

    , depsStatus = {}
  ;


  // создает пользователя
  function runModules(data) {
    var canvasOptions = data.canvasOptions
      , keys = data.keys
      , displayID = data.displayID

      , userModel
      , userView

      , chatModel
      , chatView
      , chatData = data.chat

      , panelModel
      , panelView
      , panelData = data.panel

      , statModel
      , statView
      , statData = data.stat

      , voteModel
      , voteView
      , voteData = data.vote
    ;


    //==========================================//
    // User Module
    //==========================================//

    userModel = new UserModel({
      window: window,
      sizeOptions: canvasOptions,
      keys: keys,
      socket: socket,
      ticker: ticker
    });

    userView = new UserView(userModel, {
      window: window,
      displayID: displayID
    });

    modules.user = new UserCtrl(userModel, userView);

    // инициализация
    modules.user.init({
      width: window.innerWidth,
      height: window.innerHeight
    });


    //==========================================//
    // Chat Module
    //==========================================//

    chatModel = new ChatModel({
      socket: socket,
      params: chatData.params
    });

    chatView = new ChatView(chatModel, {
      window: window,
      chat: document.getElementById(chatData.elems.chatBox),
      cmd: document.getElementById(chatData.elems.cmd)
    });

    modules.chat = new ChatCtrl(chatModel, chatView);


    //==========================================//
    // Panel Module
    //==========================================//

    panelModel = new PanelModel(panelData.routes);

    panelView = new PanelView(panelModel, {
      window: window,
      panel: panelData.elems
    });

    modules.panel = new PanelCtrl(panelModel, panelView);


    //==========================================//
    // Stat Module
    //==========================================//

    statModel = new StatModel(statData.params);

    statView = new StatView(statModel, {
      window: window,
      stat: document.getElementById(statData.elems.stat)
    });

    modules.stat = new StatCtrl(statModel, statView);


    //==========================================//
    // Vote Module
    //==========================================//

    voteModel = new VoteModel({
      window: window,
      socket: socket,
      vote: voteData.params.vote,
      time: voteData.params.time
    });

    voteView = new VoteView(voteModel, {
      window: window,
      elems: voteData.elems
    });

    modules.vote = new VoteCtrl(voteModel, voteView);


    //==========================================//
    // Подписка на события
    //==========================================//

    // событие активации режима
    userModel.publisher.on('mode', openMode);

    // подписка на данные от пользователя для режимов
    userModel.publisher.on('chat', modules.chat.updateCmd.bind(modules.chat));
    userModel.publisher.on('stat', modules.stat.close.bind(modules.stat));
    userModel.publisher.on('vote', modules.vote.assignKey.bind(modules.vote));

    // после ресайза элементов происходит перерисовка кадра
    userView.publisher.on('redraw', updateGameControllers);

    chatModel.publisher.on('mode', modules.user.switchMode.bind(modules.user));
    statModel.publisher.on('mode', modules.user.switchMode.bind(modules.user));
    voteModel.publisher.on('mode', modules.user.switchMode.bind(modules.user));
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

  // открывает режим
  function openMode(mode) {
    if (modules[mode]) {
      modules[mode].open();
    }
  }

  // дозагрузка данных
  function requestDependences() {
    if (!depsStatus.parts) {
      socket.emit('parts');
    } else if (!depsStatus.user) {
      socket.emit('user');
    } else if (!depsStatus.media) {
      socket.emit('media');
    } else if (!depsStatus.map) {
      socket.emit('map');
    } else {
      socket.emit('ready');
    }
  }

// ДАННЫЕ С СЕРВЕРА

  // разрешение на дозагрузку зависимостей
  socket.on('deps', requestDependences);

  // дозагрузка зависимостей
  socket.on('parts', function (data) {
    parts = data;

    var i = 0
      , len = data.length
      , arr = [];

    for (; i < len; i += 1) {
      arr.push(data[i].path);
    }

    require(arr, function () {
      var i = 0
        , len = arguments.length;

      for (; i < len; i += 1) {
        Factory.add(data[i].name, arguments[i]);
      }

      depsStatus.parts = true;
      requestDependences();
    });
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

    depsStatus.user = true;
    requestDependences();
  });

  // загрузка media
  socket.on('media', function (data) {
    // загрузка графических файлов
    loader = new LoadQueue(false);
    loader.loadManifest(data.manifest);

    // событие при завершении загрузки
    loader.on("complete", function () {
      depsStatus.media = true;
      requestDependences();
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
      CTRL[parts[0].canvas].parse(
        ['Map'],
        [
          {
            name: data.name,
            spriteSheet: spriteSheet,
            step: data.step,
            map: data.map,
            options: data.options
          }
        ],
        false
      );

      spriteSheet.removeAllEventListeners();

      depsStatus.map = true;
      requestDependences();
    }
  });

  // авторизация пользователя
  socket.on('auth', function (data) {
    if (typeof data !== 'object') {
      console.log('authorization error');
      return;
    }

    updateGameInformer();

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

  // для теста
  socket.on('test', function (x) {
    if (x.module === 'chat') {
      modules.chat.add({name: 'System', text: x.data});
    } else if (x.module === 'stat') {
      modules.stat.update(x.data);
    } else if (x.module === 'panel') {
      modules.panel.update(x.data);
    } else if (x.module === 'vote') {
      modules.vote.open(x.data);
    } else if (x.module === 'console') {
      console.log(x.data);
    }
  });

  // обновление данных
  socket.on('shot', function (serverData) {
    var game = serverData[0]  // массив данных для отрисовки кадра игры
      , crds = serverData[1]
      , panel = serverData[2]
      , stat = serverData[3]
      , chat = serverData[4]
      , vote = serverData[5]

      , i = 0
      , len = game.length

      , idArr
      , instances
      , cache

      , i2
      , len2
      , part;

    // объект персональных данных (координаты, панель, чат)
    coords.x = crds[0];
    coords.y = crds[1];

    for (; i < len; i += 1) {
      idArr = game[i][0];
      instances = game[i][1];
      cache = game[i][2];

      i2 = 0;
      len2 = idArr.length;

      for (; i2 < len2; i2 += 1) {
        // получение данных о конструкторе по его id
        part = parts[idArr[i2]];

        CTRL[part.canvas].parse(part.name, instances, cache);
      }
    }

    updateGameControllers();


    // обновление модулей
    if (chat) {
      modules.chat.add({name: chat[0], text: chat[1]});
    }

    if (panel) {
      modules.panel.update(panel);
    }

    if (stat) {
      modules.stat.update(stat);
    }

    if (vote) {
      modules.vote.open(vote);
    }
  });

  // вывод сообщения об ошибке соединения
  function updateGameInformer(message) {
    if (message) {
      informer.innerHTML = message;
      informer.style.display = 'block';
    } else {
      informer.innerHTML = '';
      informer.style.display = 'none';
    }
  }

  socket.on('ban', function (data) {
    var message = 'Dear ' + data[0] + ', You are banned!<br>' +
      'Reason: ' + data[1] + '<br>' +
      'Time (hours): ' + (data[2] / 1000 / 60 / 60).toFixed(2) + '<br>' +
      'Type: ' + data[3] + '<br>' +
      data[4] + '<br>';

    updateGameInformer(message);
  });

  socket.on('full_server', function (data) {
    var message;

    message = 'Server is full! Please wait or come back later!<br>' +
      'Max players: ' + data[0] + '<br>' +
      'Your waiting number: ' + data[1] + '<br>';

    updateGameInformer(message);
  });

  socket.on('connect', function () {
    updateGameInformer();
  });

  socket.on('disconnect', function () {
    updateGameInformer('Server disconnect :(');
  });

  socket.on('reconnect_failed', function () {
    updateGameInformer('Server reconnect failed :/');
  });

  socket.on('connect_failed', function () {
    updateGameInformer('Server connect failed :o');
  });

});
