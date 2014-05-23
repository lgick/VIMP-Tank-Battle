require([
  'require', 'createjs',
  'AuthModel', 'AuthView', 'AuthCtrl',
  'UserModel', 'UserView', 'UserCtrl',
  'GameModel', 'GameView', 'GameCtrl',
  'ChatModel', 'ChatView', 'ChatCtrl',
  'PanelModel', 'PanelView', 'PanelCtrl',
  'StatModel', 'StatView', 'StatCtrl',
  'VoteModel', 'VoteView', 'VoteCtrl',
  'Factory'
], function (
  require, createjs,
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
    , location = window.location
    , localStorage = window.localStorage
    , JSON = window.JSON
    , WebSocket = window.WebSocket || window.MozWebSocket

    , informer = document.getElementById('informer')

    , ws = new WebSocket('ws://' + location.host + '/')

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
    , coords = {x: 0, y: 0}

    , informList = []

      // методы для обработки сокет-данных
    , socketMethods = []

  ;

  ws.binaryType = 'arraybuffer';

// SOCKET МЕТОДЫ

  // установка конфига
  socketMethods[0] = function (data) {
    // установка дополнений игры
    function runParts(data, cb) {
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

        cb();
      });
    }

    // установка пользовательских данных
    function runUser(data, cb) {
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

      cb();
    }

    // установка медиаданных
    function runMedia(data, cb) {
      // загрузка графических файлов
      loader = new LoadQueue(false);
      loader.loadManifest(data.manifest);

      // событие при завершении загрузки
      loader.on("complete", function () {
        cb();
      });
    }

    function runInform(data, cb) {
      informList = data;
      cb();
    }

    runParts(data.parts, function () {
      runUser(data.user, function () {
        runMedia(data.media, function () {
          runInform(data.informer, function () {
            sending(0);
          });
        });
      });
    });
  };

  // авторизация пользователя
  socketMethods[1] = function (data) {
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

    authModel = new AuthModel();
    authView = new AuthView(authModel, viewData);
    modules.auth = new AuthCtrl(authModel, authView);

    authModel.publisher.on('socket', function (data) {
      sending(1, data);
    });

    modules.auth.init(params);
  };

  // подтверждение авторизации с сервера
  socketMethods[2] = function (data) {
    modules.auth.parseRes(data);
  };

  // активация карты
  socketMethods[3] = function (data) {
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
      updateGameControllers();
      sending(2);
    }
  };

  // обновление данных
  socketMethods[4] = function (data) {
    var game = data[0]  // массив данных для отрисовки кадра игры
      , crds = data[1]
      , panel = data[2]
      , stat = data[3]
      , chat = data[4]
      , vote = data[5]

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
  };

  // informer message
  socketMethods[5] = function (data) {
    var id = data[0]
      , dataArr = data[1]
      , message = informList[id]
      , i
      , len
      , regExp;

    if (message && dataArr) {
      for (i = 0, len = dataArr.length; i < len; i += 1) {
        regExp = new RegExp('#' + i, 'g');
        message = message.replace(regExp, dataArr[i]);
      }
    }

    updateGameInformer(message);
  };

  // очищает все полотна
  socketMethods[6] = function () {
    var p;

    for (p in CTRL) {
      if (CTRL.hasOwnProperty(p)) {
        CTRL[p].remove();
      }
    }

    updateGameControllers();
  };

  // тест
  socketMethods[10] = function (x) {
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
  };

// ФУНКЦИИ

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

    chatModel = new ChatModel(chatData.params);

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
      menu: voteData.params.menu,
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

    userModel.publisher.on('socket', function (data) {
      sending(3, data);
    });

    chatModel.publisher.on('socket', function (data) {
      sending(4, data);
    });

    voteModel.publisher.on('socket', function (data) {
      sending(5, data);
    });
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

  // отправляет данные
  function sending(name, data) {
    ws.send(JSON.stringify([name, data]));
  }

  // распаковывает данные
  function unpacking(pack) {
    return JSON.parse(pack);
  }

// ДАННЫЕ С СЕРВЕРА

  ws.onopen = function (event) {
    console.log('open');
  };

  ws.onclose = function (event) {
    console.log('disconnect');
  };

  ws.onmessage = function (event) {
    var msg = unpacking(event.data);

    socketMethods[msg[0]](msg[1]);
  };

});
