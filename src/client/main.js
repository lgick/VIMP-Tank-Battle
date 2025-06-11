import './style.css';
import { Application, Ticker } from 'pixi.js';
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
import wsports from '../config/wsports.js';
import parts from './parts/index.js';

const document = window.document;
const Number = window.Number;
const RegExp = window.RegExp;
const Object = window.Object;
const Array = window.Array;
const Promise = window.Promise;
const location = window.location;
const localStorage = window.localStorage;
const JSON = window.JSON;
const WebSocket = window.WebSocket;

// PS (server ports): порты получения данные от сервера
const PS_CONFIG_DATA = wsports.server.CONFIG_DATA;
const PS_AUTH_DATA = wsports.server.AUTH_DATA;
const PS_AUTH_ERRORS = wsports.server.AUTH_ERRORS;
const PS_MAP_DATA = wsports.server.MAP_DATA;
const PS_SHOT_DATA = wsports.server.SHOT_DATA;
const PS_INFORM_DATA = wsports.server.INFORM_DATA;
const PS_MISC = wsports.server.MISC;
const PS_CLEAR = wsports.server.CLEAR;
const PS_CONSOLE = wsports.server.CONSOLE;

// PC (client ports): порты получения данных от клиента
const PC_CONFIG_READY = wsports.client.CONFIG_READY;
const PC_AUTH_RESPONSE = wsports.client.AUTH_RESPONSE;
const PC_MAP_READY = wsports.client.MAP_READY;
const PC_KEYS_DATA = wsports.client.KEYS_DATA;
const PC_CHAT_DATA = wsports.client.CHAT_DATA;
const PC_VOTE_DATA = wsports.client.VOTE_DATA;

const informer = document.getElementById('informer');

const ws = new WebSocket(`ws://${location.host}/`);
ws.binaryType = 'arraybuffer';

const modules = {};

let modulesConfig = {};
let informList = []; // массив системных сообщений
const CTRL = {}; // контроллеры
const scale = {}; // масштаб
let gameSets = {}; // наборы конструкторов (id: [наборы])
let entitiesOnCanvas = {}; // сущности, отображаемые на полотнах
let currentMapSetID; // текущий ID набора конструкторов для карт
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

  modulesConfig = data.modules;
  informList = data.informer;

  // создание полотен игры
  const initPromises = Object.entries(data.modules.canvasOptions).map(
    async ([canvasId, options]) => {
      const canvas = document.getElementById(canvasId);
      const app = new Application();

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

      CTRL[canvasId] = makeGameController(app);

      // пропорции изображения на полотне
      const [w, h] = (options.scale || '1:1')
        .split(':')
        .map(value => Number(value));
      scale[canvasId] = w / h;
    },
  );

  Promise.all(initPromises)
    .then(() => {
      sending(PC_CONFIG_READY); // config ready
    })

    .catch(err => {
      console.error('Ошибка инициализации:', err);
    });
};

// auth data
socketMethods[PS_AUTH_DATA] = data => {
  if (typeof data !== 'object' || data === null) {
    console.log('authorization error');
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

  const viewData = {
    window,
    auth: document.getElementById(elems.authId),
    form: document.getElementById(elems.formId),
    error: document.getElementById(elems.errorId),
    enter: document.getElementById(elems.enterId),
  };

  const authModel = new AuthModel();
  const authView = new AuthView(authModel, viewData);
  modules.auth = new AuthCtrl(authModel, authView);

  authModel.publisher.on('socket', data => sending(PC_AUTH_RESPONSE, data));

  modules.auth.init(params);
};

// auth errors
socketMethods[PS_AUTH_ERRORS] = err => {
  modules.auth.parseRes(err);

  if (!err) {
    runModules(modulesConfig);
  }
};

// map data
socketMethods[PS_MAP_DATA] = data => {
  const { layers, map, step, setID, spriteSheet, physicsStatic } = data;

  // удаление данных карт
  const removeMap = setID => {
    const nameArr = gameSets[setID] || [];

    nameArr.forEach(name => {
      CTRL[entitiesOnCanvas[name]].remove(name);
    });
  };

  // создание карт
  const createMap = (setID, staticData) => {
    const nameArr = gameSets[setID];
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

    currentMapSetID = setID;
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

  removeMap(currentMapSetID);
  createMap(setID, staticData);
  updateGameControllers();
  sending(PC_MAP_READY);
};

// shot data
socketMethods[PS_SHOT_DATA] = data => {
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
socketMethods[PS_INFORM_DATA] = data => {
  if (data) {
    const [messageKey, dataArr] = data;
    let message = informList[messageKey];

    if (message && dataArr) {
      dataArr.forEach((value, index) => {
        const regExp = new RegExp(`\\{${index}\\}`, 'g');
        message = message.replace(regExp, value);
      });
    }

    informer.innerHTML = message;
    informer.style.display = 'block';
  } else {
    informer.innerHTML = '';
    informer.style.display = 'none';
  }
};

// misc
socketMethods[PS_MISC] = data => {
  const { key, value } = data;

  if (key === 'localstorageNameReplace') {
    localStorage['userName'] = value;
  }
};

// clear
socketMethods[PS_CLEAR] = function (setIDList) {
  // если есть список setID (учитывается в том числе пустой список)
  if (Array.isArray(setIDList)) {
    for (let i = 0, len = setIDList.length; i < len; i += 1) {
      const nameArr = gameSets[setIDList[i]] || [];

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

// создает пользователя
function runModules(data) {
  const {
    canvasOptions,
    keys,
    displayID,
    chat: chatData,
    panel: panelData,
    stat: statData,
    vote: voteData,
  } = data;

  //==========================================//
  // User Module
  //==========================================//

  const userModel = new UserModel({
    window,
    sizeOptions: canvasOptions,
    keys,
    Ticker,
  });

  const userView = new UserView(userModel, {
    window,
    displayID,
  });

  modules.user = new UserCtrl(userModel, userView);

  // инициализация
  modules.user.init({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  //==========================================//
  // Chat Module
  //==========================================//

  const chatModel = new ChatModel({
    window,
    listLimit: chatData.params.listLimit,
    lineTime: chatData.params.lineTime,
    cacheMin: chatData.params.cacheMin,
    cacheMax: chatData.params.cacheMax,
    messages: chatData.params.messages,
    messageExp: chatData.params.messageExp,
  });

  const chatView = new ChatView(chatModel, {
    window,
    chat: document.getElementById(chatData.elems.chatBox),
    cmd: document.getElementById(chatData.elems.cmd),
  });

  modules.chat = new ChatCtrl(chatModel, chatView);

  //==========================================//
  // Panel Module
  //==========================================//

  const panelModel = new PanelModel({
    window,
    panels: panelData.panels,
  });

  const panelView = new PanelView(panelModel, {
    window,
    panel: panelData.elems,
  });

  modules.panel = new PanelCtrl(panelModel, panelView);

  //==========================================//
  // Stat Module
  //==========================================//

  const statModel = new StatModel(statData.params);

  const statView = new StatView(statModel, {
    window,
    stat: document.getElementById(statData.elems.stat),
  });

  modules.stat = new StatCtrl(statModel, statView);

  //==========================================//
  // Vote Module
  //==========================================//

  const voteModel = new VoteModel({
    window,
    menu: voteData.params.menu,
    time: voteData.params.time,
  });

  const voteView = new VoteView(voteModel, {
    window,
    elems: voteData.elems,
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

  userModel.publisher.on('socket', data => sending(PC_KEYS_DATA, data));
  chatModel.publisher.on('socket', data => sending(PC_CHAT_DATA, data));
  voteModel.publisher.on('socket', data => sending(PC_VOTE_DATA, data));
}

// создает экземпляр игры
function makeGameController(app) {
  const model = new GameModel();
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

// ДАННЫЕ С СЕРВЕРА

ws.onopen = () => {
  console.log('open');
};

ws.onclose = e => {
  if (e.reason) {
    const msg = unpacking(e.reason);
    socketMethods[msg[0]](msg[1]);
  } else {
    socketMethods[5]([3]);
  }

  console.log('disconnect');
};

ws.onmessage = e => {
  const msg = unpacking(e.data);

  socketMethods[msg[0]](msg[1]);
};
