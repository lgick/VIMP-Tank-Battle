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

    , loader

    , modulesConfig
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

  // config data
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
    function runCanvases(data, cb) {
      var canvas
        , canvasOptions = data.canvasOptions
        , s;

      modulesConfig = data;

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
      runCanvases(data.user, function () {
        runMedia(data.media, function () {
          runInform(data.informer, function () {
            sending(0);
          });
        });
      });
    });
  };

  // auth data
  socketMethods[1] = function (data) {
    if (typeof data !== 'object') {
      console.log('authorization error');
      return;
    }

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

  // auth errors
  socketMethods[2] = function (err) {
    modules.auth.parseRes(err);

    if (!err) {
      runModules(modulesConfig);
    }
  };

  // map data
  socketMethods[3] = function (data) {
    var spriteSheet = new SpriteSheet(data.spriteSheet);

    if (!spriteSheet.complete) {
      spriteSheet.addEventListener('complete', create);
    } else {
      create();
    }

    // создание карты
    function create() {
      var layers = data.layers
        , part = parts[data.partID]
        , name = part.name
        , canvas = part.canvas
        , mapData = {}
        , p
      ;

      // удалить данные старой карты
      CTRL[canvas].remove(name);

      for (p in layers) {
        if (layers.hasOwnProperty(p)) {
          mapData[p] = {
            layer: p,
            tiles: layers[p],
            spriteSheet: spriteSheet,
            map: data.map,
            step: data.step
          };
        }
      }

      CTRL[canvas].parse(name, mapData);

      spriteSheet.removeAllEventListeners();
      updateGameControllers();
      sending(2);
    }
  };

  // shot data
  socketMethods[4] = function (data) {
    var game = data[0]
      , crds = data[1]
      , panel = data[2]
      , stat = data[3]
      , chat = data[4]
      , vote = data[5]

      , i
      , len

      , idArr
      , instances

      , i2
      , len2
      , part
    ;

    // игра
    if (game !== 0) {
      for (i = 0, len = game.length; i < len; i += 1) {
        idArr = game[i][0];
        instances = game[i][1];

        for (i2 = 0, len2 = idArr.length; i2 < len2; i2 += 1) {
          // получение данных о конструкторе по его id
          part = parts[idArr[i2]];

          CTRL[part.canvas].parse(part.name, instances);
        }
      }
    }

    // координаты
    if (crds !== 0) {
      coords.x = crds[0];
      coords.y = crds[1];
    }

    updateGameControllers();

    // панель
    if (panel !== 0) {
      modules.panel.update(panel);
    }

    // статистика
    if (stat !== 0) {
      modules.stat.update(stat);
    }

    // чат
    if (chat !== 0) {
      modules.chat.add(chat);
    }

    // голосование
    if (vote !== 0) {
      modules.vote.open(vote);
    }
  };

  // inform data
  socketMethods[5] = function (data) {
    var dataArr
      , message
      , i
      , len
      , regExp;

    if (data) {
      message = informList[data[0]];
      dataArr = data[1];

      if (message && dataArr) {
        for (i = 0, len = dataArr.length; i < len; i += 1) {
          regExp = new RegExp('#' + i, 'g');
          message = message.replace(regExp, dataArr[i]);
        }
      }

      informer.innerHTML = message;
      informer.style.display = 'block';
    } else {
      informer.innerHTML = '';
      informer.style.display = 'none';
    }
  };

  // clear
  socketMethods[6] = function () {
    var p;

    for (p in CTRL) {
      if (CTRL.hasOwnProperty(p)) {
        CTRL[p].remove();
      }
    }

    updateGameControllers();
  };

  // console
  socketMethods[7] = function (data) {
    console.log(data);
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

    panelModel = new PanelModel(panelData.panels);

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

  // отправляет данные
  function sending(name, data) {
    ws.send(JSON.stringify([name, data]));
  }

  // распаковывает данные
  function unpacking(pack) {
    return JSON.parse(pack);
  }

// ДАННЫЕ С СЕРВЕРА

  ws.onopen = function (e) {
    console.log('open');
  };

  ws.onclose = function (e) {
    var msg;

    if (e.reason) {
      msg = unpacking(e.reason);
      socketMethods[msg[0]](msg[1]);
    } else {
      socketMethods[5]([4]);
    }

    console.log('disconnect');
  };

  ws.onmessage = function (e) {
    var msg = unpacking(e.data);

    socketMethods[msg[0]](msg[1]);
  };

});
