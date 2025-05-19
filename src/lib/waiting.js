import config from './config.js';

let waitingList = [];
let currentPlayers = [];
const maxPlayers = config.get('server:maxPlayers');

// проверяет наличие свободные мест
const check = (id, cb) => {
  let res = false;

  if (currentPlayers.length < maxPlayers) {
    currentPlayers.push(id);
    res = true;
  }

  process.nextTick(() => cb(res));
};

// добавляет ожидающего
const add = (id, cb) => {
  waitingList.push(id);
  process.nextTick(() => cb([maxPlayers, waitingList.length]));
};

// удаляет данных
const remove = id => {
  currentPlayers = currentPlayers.filter(playerId => playerId !== id);
  waitingList = waitingList.filter(playerId => playerId !== id);
};

// возвращает ожидающего и удаляет его из листа
const getNext = cb => {
  let id = null;

  if (currentPlayers.length < maxPlayers) {
    id = waitingList.shift();

    if (id) {
      currentPlayers.push(id);
    }
  }

  process.nextTick(() => cb(id));
};

// создает объект для оповещения ожидающих
const createNotifyObject = cb => {
  const notifyObject = waitingList.reduce((acc, playerId, index) => {
    acc[playerId] = [maxPlayers, index + 1];
    return acc;
  }, {});

  process.nextTick(() => cb(notifyObject));
};

export default {
  check,
  add,
  remove,
  getNext,
  createNotifyObject,
};
