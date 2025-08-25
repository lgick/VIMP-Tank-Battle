import './style.css';
import 'pixi.js/unsafe-eval';
import { Application } from 'pixi.js';
import AuthModel from './components/model/Auth.js';
import AuthView from './components/view/Auth.js';
import AuthCtrl from './components/controller/Auth.js';
import UserModel from './components/model/User.js';
import UserView from './components/view/User.js';
import UserCtrl from './components/controller/User.js';
import GameModel from './components/model/Game.js';
import GameView from './components/view/Game.js';
import GameCtrl from './components/controller/Game.js';
import ChatModel from './components/model/Chat.js';
import ChatView from './components/view/Chat.js';
import ChatCtrl from './components/controller/Chat.js';
import PanelModel from './components/model/Panel.js';
import PanelView from './components/view/Panel.js';
import PanelCtrl from './components/controller/Panel.js';
import StatModel from './components/model/Stat.js';
import StatView from './components/view/Stat.js';
import StatCtrl from './components/controller/Stat.js';
import VoteModel from './components/model/Vote.js';
import VoteView from './components/view/Vote.js';
import VoteCtrl from './components/controller/Vote.js';
import Factory from '../lib/factory.js';
import SoundManager from './SoundManager.js';
import BakingProvider from './providers/BakingProvider.js';
import DependencyProvider from './providers/DependencyProvider.js';
import wsports from '../config/wsports.js';
import parts from './parts/index.js';

// PS (server ports): порты получения данные от сервера
const PS_CONFIG_DATA = wsports.server.CONFIG_DATA;
const PS_AUTH_DATA = wsports.server.AUTH_DATA;
const PS_AUTH_ERRORS = wsports.server.AUTH_ERRORS;
const PS_MAP_DATA = wsports.server.MAP_DATA;
const PS_FIRST_SHOT_DATA = wsports.server.FIRST_SHOT_DATA;
const PS_SHOT_DATA = wsports.server.SHOT_DATA;
const PS_SOUND_DATA = wsports.server.SOUND_DATA;
const PS_GAME_INFORM_DATA = wsports.server.GAME_INFORM_DATA;
const PS_TECH_INFORM_DATA = wsports.server.TECH_INFORM_DATA;
const PS_MISC = wsports.server.MISC;
const PS_PING = wsports.server.PING;
const PS_CLEAR = wsports.server.CLEAR;
const PS_CONSOLE = wsports.server.CONSOLE;

// PC (client ports): порты получения данных от клиента
const PC_CONFIG_READY = wsports.client.CONFIG_READY;
const PC_AUTH_RESPONSE = wsports.client.AUTH_RESPONSE;
const PC_MAP_READY = wsports.client.MAP_READY;
const PC_FIRST_SHOT_READY = wsports.client.FIRST_SHOT_READY;
const PC_KEYS_DATA = wsports.client.KEYS_DATA;
const PC_CHAT_DATA = wsports.client.CHAT_DATA;
const PC_VOTE_DATA = wsports.client.VOTE_DATA;
const PC_PONG = wsports.client.PONG;

const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${wsProtocol}//${location.host}/`);
ws.binaryType = 'arraybuffer';

const modules = {};

// создание и инициализация SoundManager
const soundManager = new SoundManager();

let modulesConfig = {};

let gameInformer = null;
let gameInformList = []; // массив игровых сообщений

const techInformer = document.getElementById('tech-informer');
let techInformList = []; // массив системных сообщений

const CTRL = {}; // контроллеры
const scale = {}; // масштаб
let gameSets = {}; // наборы конструкторов (id: [наборы])
let entitiesOnCanvas = {}; // сущности, отображаемые на полотнах
let currentMapSetId; // текущий id набора конструкторов для карт
const coords = { x: 0, y: 0 }; // координаты
const socketMethods = []; // методы для обработки сокет-данных

// SOCKET МЕТОДЫ

// config data
socketMethods[PS_CONFIG_DATA] = async data => {
  gameSets = data.parts.gameSets;
  entitiesOnCanvas = data.parts.entitiesOnCanvas;

  // инициализация сущностей игры
  for (const entity of Object.keys(entitiesOnCanvas)) {
    Factory.add({ [entity]: parts[entity] });
  }

  gameInformer = document.getElementById(data.gameInform.id);
  gameInformList = data.gameInform.list;

  techInformList = data.techInformList;

  modulesConfig = data.modules;

  const bakedAssets = data.parts.bakedAssets || {};
  const componentDependencies = data.parts.componentDependencies || {};
  const sounds = data.parts.sounds || {};
  // загрузка звуков
  await soundManager.load(sounds);

  // создание полотен игры
  const initPromises = Object.entries(modulesConfig.canvasOptions).map(
    async ([canvasId, options]) => {
      const canvas = document.getElementById(canvasId);
      const app = new Application();
      const assetProvider = new BakingProvider();
      const dependencyProvider = new DependencyProvider();
      const bakingArr = bakedAssets[canvasId];

      await app.init({
        canvas,
        width: canvas.width,
        height: canvas.height,
        antialias: true,
        backgroundAlpha: 0,
        accessibilityOptions: {
          activateOnTab: false,
        },
      });

      // пул всех доступных сервисов в этом контексте
      const availableServices = {
        renderer: app.renderer,
        soundManager,
      };

      // если есть данные для запекания компонентов
      if (bakingArr) {
        assetProvider.bakeAll(bakingArr, app);
      }

      dependencyProvider.collectAll(availableServices, componentDependencies);

      CTRL[canvasId] = makeGameController(
        assetProvider.getAssetsCollection(),
        dependencyProvider.getDependenciesCollection(),
        app,
      );

      // пропорции изображения на полотне
      const [w, h] = (options.scale || '1:1')
        .split(':')
        .map(value => Number(value));
      scale[canvasId] = Number((w / h).toFixed(2));
    },
  );

  Promise.all(initPromises)
    .then(() => {
      sending(PC_CONFIG_READY); // config ready
    })

    .catch(err => {
      console.error('Initialization error:', err);
    });
};

// auth data
socketMethods[PS_AUTH_DATA] = data => {
  if (typeof data !== 'object' || data === null) {
    return;
  }

  const { elems, params } = data;

  params.forEach(param => {
    const { storage, regExp } = param.options;

    if (storage) {
      param.value = localStorage[storage] || param.value || '';
    }

    if (regExp) {
      param.options.regExp = new RegExp(regExp);
    }
  });

  const authModel = new AuthModel();
  const authView = new AuthView(authModel, elems);
  modules.auth = new AuthCtrl(authModel, authView);

  authModel.publisher.on('socket', data => sending(PC_AUTH_RESPONSE, data));

  modules.auth.init(params);
};

// auth errors
socketMethods[PS_AUTH_ERRORS] = err => {
  modules.auth.parseRes(err);

  if (!err) {
    runModules(modulesConfig);

    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
};

// map data
socketMethods[PS_MAP_DATA] = data => {
  const { layers, map, step, setId, spriteSheet, physicsStatic } = data;

  // удаление данных карт
  const removeMap = setId => {
    const nameArr = gameSets[setId] || [];

    nameArr.forEach(name => {
      CTRL[entitiesOnCanvas[name]].remove(name);
    });
  };

  // создание карт
  const createMap = (setId, staticData) => {
    const nameArr = gameSets[setId];
    const dynamicArr = data.physicsDynamic || [];
    const dynamicData = {};

    dynamicArr.forEach((item, index) => {
      const key = `d${index}`;
      dynamicData[key] = { ...item, type: 'dynamic' };
    });

    nameArr.forEach(name => {
      const canvasId = entitiesOnCanvas[name];

      // статические данные карты
      CTRL[canvasId].parse(name, staticData);

      // динамические данные карты
      CTRL[canvasId].parse(name, dynamicData);
    });

    currentMapSetId = setId;
  };

  const staticData = Object.entries(layers).reduce(
    (acc, [layer, tiles], index) => {
      acc[`s${index}`] = {
        type: 'static',
        spriteSheet,
        map,
        step,
        layer,
        tiles,
        physicsStatic,
      };

      return acc;
    },
    {},
  );

  removeMap(currentMapSetId);
  createMap(setId, staticData);
  updateGameControllers();
  sending(PC_MAP_READY);
};

// первый shot сразу после загрузки карты
socketMethods[PS_FIRST_SHOT_DATA] = data => {
  shotData(data);

  // подтверждение получения первого шота
  sending(PC_FIRST_SHOT_READY);
};

// shot data
socketMethods[PS_SHOT_DATA] = shotData;

// sound data
socketMethods[PS_SOUND_DATA] = sample => {
  soundManager.play(sample);
};

// game inform data
socketMethods[PS_GAME_INFORM_DATA] = data => {
  if (data) {
    const [key, arr] = data;

    gameInformer.textContent = formatMessage(gameInformList[key], arr);
    gameInformer.style.display = 'block';

    setTimeout(() => {
      gameInformer.textContent = '';
      gameInformer.style.display = 'none';
    }, 3000);
  }
};

// technical inform data
socketMethods[PS_TECH_INFORM_DATA] = data => {
  if (data) {
    const [key, arr] = data;
    const message = techInformList[key] || 'Unknown error';

    modules.user?.disableKeys();
    techInformer.textContent = formatMessage(message, arr);
    techInformer.style.display = 'block';
  } else {
    modules.user?.enableKeys();
    techInformer.textContent = '';
    techInformer.style.display = 'none';
  }
};

// misc
socketMethods[PS_MISC] = data => {
  const { key, value } = data;

  if (key === 'localstorageNameReplace') {
    localStorage['userName'] = value;
  }
};

// ping
socketMethods[PS_PING] = pingId => {
  sending(PC_PONG, pingId);
};

// clear
socketMethods[PS_CLEAR] = function (setIdList) {
  // если есть список setId (учитывается в том числе пустой список)
  if (Array.isArray(setIdList)) {
    for (let i = 0, len = setIdList.length; i < len; i += 1) {
      const nameArr = gameSets[setIdList[i]] || [];

      nameArr.forEach(name => {
        CTRL[entitiesOnCanvas[name]].remove(name);
      });
    }
  } else {
    for (const p in CTRL) {
      if (Object.hasOwn(CTRL, p)) {
        CTRL[p].remove();
      }
    }
  }

  updateGameControllers();
};

// console
socketMethods[PS_CONSOLE] = data => {
  console.log(data);
};

// ФУНКЦИИ

function shotData(data) {
  const [game, crds, panel, stat, chat, vote, keySet] = data;

  // данные игры
  Object.entries(game).forEach(([p, instances]) => {
    const nameArr = gameSets[p];

    nameArr.forEach(name => {
      CTRL[entitiesOnCanvas[name]].parse(name, instances);
    });
  });

  // координаты
  if (crds !== 0) {
    coords.x = crds[0];
    coords.y = crds[1];
    soundManager.setListenerPosition(coords.x, coords.y);
    soundManager.setListenerOrientation();
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
}

// добавляет в сообщение параметры
function formatMessage(message = '', arr = []) {
  if (message && arr.length) {
    arr.forEach((value, index) => {
      const regExp = new RegExp(`\\{${index}\\}`, 'g');

      message = message.replace(regExp, value);
    });
  }

  return message;
}

// создает пользователя
function runModules(data) {
  const {
    canvasOptions,
    keys,
    displayIdList,
    chat: chatData,
    panel: panelData,
    stat: statData,
    vote: voteData,
  } = data;

  //==========================================//
  // User Module
  //==========================================//

  const userModel = new UserModel({
    sizeOptions: canvasOptions,
    keys,
  });

  const userView = new UserView(userModel, displayIdList);

  modules.user = new UserCtrl(userModel, userView);

  // инициализация
  modules.user.init({
    width: innerWidth,
    height: innerHeight,
  });

  //==========================================//
  // Chat Module
  //==========================================//

  const chatModel = new ChatModel({
    listLimit: chatData.params.listLimit,
    lineTime: chatData.params.lineTime,
    cacheMin: chatData.params.cacheMin,
    cacheMax: chatData.params.cacheMax,
    messages: chatData.params.messages,
    messageExp: chatData.params.messageExp,
  });

  const chatView = new ChatView(chatModel, chatData.elems);

  modules.chat = new ChatCtrl(chatModel, chatView);

  //==========================================//
  // Panel Module
  //==========================================//

  const panelModel = new PanelModel(panelData.keys);
  const panelView = new PanelView(panelModel, panelData.elems);

  modules.panel = new PanelCtrl(panelModel, panelView);

  //==========================================//
  // Stat Module
  //==========================================//

  const statModel = new StatModel(statData.params);
  const statView = new StatView(statModel, statData.elems);

  modules.stat = new StatCtrl(statModel, statView);

  //==========================================//
  // Vote Module
  //==========================================//

  const voteModel = new VoteModel({
    menu: voteData.params.menu,
    time: voteData.params.time,
  });

  const voteView = new VoteView(voteModel, voteData.elems);

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

  userModel.publisher.on('socket', data => sending(PC_KEYS_DATA, data));
  chatModel.publisher.on('socket', data => sending(PC_CHAT_DATA, data));
  voteModel.publisher.on('socket', data => sending(PC_VOTE_DATA, data));
}

// создает экземпляр игры
function makeGameController(assetsCollection, dependenciesCollection, app) {
  const model = new GameModel(assetsCollection, dependenciesCollection);
  const view = new GameView(model, app);
  const controller = new GameCtrl(model, view);

  return controller;
}

// обновляет полотна
function updateGameControllers() {
  Object.keys(CTRL).forEach(canvasId => {
    CTRL[canvasId].update(coords, scale[canvasId]);
  });
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

// обработчик видимости вкладки
function handleVisibilityChange() {
  // если вкладка неактивна, выключение звука
  if (document.visibilityState === 'hidden') {
    soundManager.mute();
    // иначе включение звука при возвращении
  } else {
    soundManager.unmute();
  }
}

// ДАННЫЕ С СЕРВЕРА

ws.onopen = () => {};

ws.onclose = e => {
  const connectionInterruptedId = 3;

  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (e.reason) {
    const msg = unpacking(e.reason);
    socketMethods[msg[0]](msg[1]);
  } else {
    socketMethods[PS_TECH_INFORM_DATA]([connectionInterruptedId]);
  }
};

ws.onmessage = e => {
  const msg = unpacking(e.data);

  socketMethods[msg[0]](msg[1]);
};
