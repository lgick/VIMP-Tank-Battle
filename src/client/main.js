import './style.css';
import { Application, Assets, Sprite } from 'pixi.js';
import AuthModel from './components/model/auth.js';
import AuthView from './components/view/auth.js';
import AuthCtrl from './components/controller/auth.js';
import UserModel from './components/model/user.js';
import UserView from './components/view/user.js';
import UserCtrl from './components/controller/user.js';
import GameModel from './components/model/game.js';
import GameView from './components/view/game.js';
import GameCtrl from './components/controller/game.js';
import ChatModel from './components/model/chat.js';
import ChatView from './components/view/chat.js';
import ChatCtrl from './components/controller/chat.js';
import PanelModel from './components/model/panel.js';
import PanelView from './components/view/panel.js';
import PanelCtrl from './components/controller/panel.js';
import StatModel from './components/model/stat.js';
import StatView from './components/view/stat.js';
import StatCtrl from './components/controller/stat.js';
import VoteModel from './components/model/vote.js';
import VoteView from './components/view/vote.js';
import VoteCtrl from './components/controller/vote.js';
import Factory from '../server/lib/factory.js';
import entities from './parts/constructors/index.js';

const document = window.document;
const parseInt = window.parseInt;
const RegExp = window.RegExp;
const location = window.location;
const localStorage = window.localStorage;
const JSON = window.JSON;
const WebSocket = window.WebSocket;

const informer = document.getElementById('informer');

const ws = new WebSocket(`ws://${location.host}/`);
ws.binaryType = 'arraybuffer';

const { SpriteSheet, Ticker: ticker } = createjs;

let modulesConfig;
const modules = {};

const CTRL = {}; // контроллеры
const scale = {}; // масштаб
let gameSets = {}; // наборы конструкторов (id: [наборы])
let entitiesOnCanvas = {}; // сущности, отображаемые на полотнах
let currentMapSetID; // текущий ID набора конструкторов для карт
const coords = { x: 0, y: 0 }; // координаты
let informList = []; // массив системных сообщений
const socketMethods = []; // методы для обработки сокет-данных

// SOCKET МЕТОДЫ

// config data
socketMethods[0] = async data => {
  // инициализация сущностей игры
  const initParts = async data => {
    gameSets = data.gameSets;
    entitiesOnCanvas = data.entitiesOnCanvas;

    for (const entity of Object.keys(entitiesOnCanvas)) {
      Factory.add({ [entity]: entities[entity] });
    }
  };

  // установка пользовательских данных
  const runCanvases = async data => {
    modulesConfig = data;

    Object.entries(data.canvasOptions).forEach(([canvas, options]) => {
      // создание контроллера полотна
      CTRL[canvas] = makeGameController(canvas);

      // пропорции изображения на полотне
      const [w, h] = (options.scale || '1:1')
        .split(':')
        .map(value => parseInt(value, 10));
      scale[canvas] = w / h;
    });
  };

  const runInform = async data => {
    informList = data;
  };

  // Последовательное выполнение шагов
  await initParts(data.parts);
  await runCanvases(data.user);
  await runInform(data.informer);
  sending(0);
};

// auth data
socketMethods[1] = data => {
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

  authModel.publisher.on('socket', data => sending(1, data));

  modules.auth.init(params);
};

// auth errors
socketMethods[2] = err => {
  modules.auth.parseRes(err);

  if (!err) {
    runModules(modulesConfig);
  }
};

// map data
socketMethods[3] = data => {
  const spriteSheet = new SpriteSheet(data.spriteSheet);

  // удаление данных карт
  const removeMap = setID => {
    const nameArr = gameSets[setID];

    // если есть конструкторы для удаления
    if (nameArr) {
      nameArr.forEach(name => {
        CTRL[entitiesOnCanvas[name]].remove(name);
      });
    }
  };

  // создание карт
  const createMap = (setID, mapData) => {
    const nameArr = gameSets[setID];
    const dynamicArr = data.physicsDynamic || [];
    const dynamicData = {};

    dynamicArr.forEach((item, index) => {
      const key = `d${index}`;
      dynamicData[key] = { ...item, type: 'dynamic' };
    });

    nameArr.forEach(name => {
      const canvas = entitiesOnCanvas[name];

      // статические данные карты
      CTRL[canvas].parse(name, mapData);

      // динамические данные карты
      CTRL[canvas].parse(name, dynamicData);
    });

    currentMapSetID = setID;
  };

  // готовность данныx для создания карт
  const readyData = () => {
    const { layers, map, step, setID } = data;
    const mapData = Object.entries(layers).reduce((acc, [layerKey, tiles]) => {
      acc[`s${layerKey}`] = {
        type: 'static',
        spriteSheet,
        map,
        step,
        layer: layerKey,
        tiles,
      };
      return acc;
    }, {});

    removeMap(currentMapSetID);
    createMap(setID, mapData);

    spriteSheet.removeAllEventListeners();
    updateGameControllers();
    sending(2);
  };

  if (!spriteSheet.complete) {
    spriteSheet.addEventListener('complete', readyData);
  } else {
    readyData();
  }
};

// shot data
socketMethods[4] = data => {
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
socketMethods[5] = data => {
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

// clear
socketMethods[6] = () => {
  Object.values(CTRL).forEach(ctrl => ctrl.remove());
  updateGameControllers();
};

// console
socketMethods[7] = data => {
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
    ticker,
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

  userModel.publisher.on('socket', data => sending(3, data));
  chatModel.publisher.on('socket', data => sending(4, data));
  voteModel.publisher.on('socket', data => sending(5, data));
}

// создает экземпляр игры
function makeGameController(canvasId) {
  const model = new GameModel();
  const view = new GameView(model, canvasId);
  const controller = new GameCtrl(model, view);

  return controller;
}

// обновляет полотна
function updateGameControllers() {
  Object.keys(CTRL).forEach(name => {
    CTRL[name].update(coords, scale[name]);
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

ws.onopen = e => {
  console.log('open');
};

ws.onclose = e => {
  if (e.reason) {
    const msg = unpacking(e.reason);
    socketMethods[msg[0]](msg[1]);
  } else {
    socketMethods[5]([4]);
  }

  console.log('disconnect');
};

ws.onmessage = e => {
  const msg = unpacking(e.data);

  socketMethods[msg[0]](msg[1]);
};
