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

    , CTRL = {}               // контроллеры
    , scale = {}              // масштабы
    , gameSets                // наборы конструкторов (id: [наборы])
    , parts                   // конструкторы
    , currentMapSetID         // текущий ID набора конструкторов для карт
    , coords = {x: 0, y: 0}   // координаты
    , informList = []         // массив системных сообщений
    , socketMethods = []      // методы для обработки сокет-данных
  ;

  ws.binaryType = 'arraybuffer';

// SOCKET МЕТОДЫ

  // config data
  socketMethods[0] = function (data) {
    // загрузка дополнительных модулей игры
    function runParts(data, cb) {
      gameSets = data.gameSets;
      parts = data.modules;

      var p
        , names = []
        , arr = [];

      for (p in parts) {
        if (parts.hasOwnProperty(p)) {
          names.push(p);
          arr.push(parts[p].path);
        }
      }

      require(arr, function () {
        var i = 0
          , len = arguments.length
          , data = {};

        for (; i < len; i += 1) {
          data[names[i]] = arguments[i];
        }

        Factory.add(data);
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
        params[i].value =
          window.localStorage[storage] || params[i].value || '';
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
      spriteSheet.addEventListener('complete', readyData);
    } else {
      readyData();
    }

    // удаление данных карт
    function removeMap(setID) {
      var nameArr = gameSets[setID]
        , i
        , len
        , name;

      // если есть конструкторы для удаления
      if (nameArr) {
        for (i = 0, len = nameArr.length; i < len; i += 1) {
          name = nameArr[i];
          CTRL[parts[name].canvas].remove(name);
        }
      }
    }

    // создание карт
    function createMap(setID, mapData) {
      var nameArr = gameSets[setID]
        , dynamicArr = data.physicsDynamic
        , dynamicData = {}
        , item
        , name
        , canvas
        , i
        , len
        , i2
        , len2;

      for (i = 0, len = dynamicArr.length; i < len; i += 1) {
        item = 'd' + i;
        dynamicData[item] = dynamicArr[i];
        dynamicData[item].type = 'dynamic';
      }

      for (i2 = 0, len2 = nameArr.length; i2 < len2; i2 += 1) {
        name = nameArr[i2];
        canvas = parts[name].canvas;

        // статические данные карты
        CTRL[canvas].parse(name, mapData);

        // динамические данные карты
        CTRL[canvas].parse(name, dynamicData);
      }

      currentMapSetID = setID;
    }

    // готовность данныx для создания карт
    function readyData() {
      var layers = data.layers
        , mapData = {}
        , p;

      for (p in layers) {
        if (layers.hasOwnProperty(p)) {
          mapData['s' + p] = {
            type: 'static',
            spriteSheet: spriteSheet,
            map: data.map,
            step: data.step,
            layer: p,
            tiles: layers[p]
          };
        }
      }

      removeMap(currentMapSetID);
      createMap(data.setID, mapData);

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
      , keySet = data[6]

      , p
      , i
      , len

      , nameArr
      , name
      , instances
    ;

    // данные игры
    for (p in game) {
      if (game.hasOwnProperty(p)) {
        nameArr = gameSets[p];
        instances = game[p];

        for (i = 0, len = nameArr.length; i < len; i += 1) {
          name = nameArr[i];
          CTRL[parts[name].canvas].parse(name, instances);
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

    // набор клавиш
    if (typeof keySet === 'number') {
      modules.user.changeKeySet(keySet);
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
          regExp = new RegExp('\\{' + i + '\\}', 'g');
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

    chatModel = new ChatModel({
      window: window,
      listLimit: chatData.params.listLimit,
      lineTime: chatData.params.lineTime,
      cacheMin: chatData.params.cacheMin,
      cacheMax: chatData.params.cacheMax,
      messages: chatData.params.messages,
      messageExp: chatData.params.messageExp
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

    panelModel = new PanelModel({
      window: window,
      panels: panelData.panels
    });

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

    userModel.publisher.on('socket', function (data) { sending(3, data); });
    chatModel.publisher.on('socket', function (data) { sending(4, data); });
    voteModel.publisher.on('socket', function (data) { sending(5, data); });
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
