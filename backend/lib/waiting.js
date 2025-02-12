import config from './config';

let waitingList = [];
let currentPlayers = [];
const maxPlayers = config.get('server:maxPlayers');

// проверяет наличие свободные мест
export const check = (id, cb) => {
  let res = false;

  if (currentPlayers.length < maxPlayers) {
    currentPlayers.push(id);
    res = true;
  }

  process.nextTick(() => cb(res));
};

// добавляет ожидающего
export const add = (id, cb) => {
  waitingList.push(id);
  process.nextTick(() => cb([maxPlayers, waitingList.length]));
};

// удаляет данных
export const remove = id => {
  currentPlayers = currentPlayers.filter(playerId => playerId !== id);
  waitingList = waitingList.filter(playerId => playerId !== id);
};

// возвращает ожидающего и удаляет его из листа
export const getNext = cb => {
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
export const createNotifyObject = cb => {
  const notifyObject = waitingList.reduce((acc, playerId, index) => {
    acc[playerId] = [maxPlayers, index + 1];
    return acc;
  }, {});

  process.nextTick(() => cb(notifyObject));
};
