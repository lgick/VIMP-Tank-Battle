var config = require('../config');

var maxPlayers = config.get('basic:maxPlayers');

var waitingList = [];

// проверяет наличие свободные мест
// true: отсутствие мест
exports.check = function (users, cb) {

  process.nextTick(function () {
    cb(maxPlayers < users);
  });
};

// добавляет ожидающего
exports.add = function (socketID, cb) {
  waitingList.push(socketID);

  process.nextTick(function () {
    cb([maxPlayers, waitingList.length]);
  });
};

// удаляет ожидающего
exports.remove = function (socketID) {
  var i = 0
    , len = waitingList.length;

  for (; i < len; i += 1) {
    if (waitingList[i] === socketID) {
      waitingList.splice(i, 1);
    }
  }
};

// возвращает ожидающего и удаляет его из листа
exports.getNext = function (players, cb) {
  var socketID;

  if (maxPlayers > players) {
    socketID = waitingList.shift();
  } else {
    socketID = null;
  }

  process.nextTick(function () {
    cb(socketID);
  });
};

// создает объект для оповещения ожидающих
exports.createNotifyObject = function (cb) {
  var i = 0
    , len = waitingList.length
    , notifyObject = {};

  for (; i < len; i += 1) {
    notifyObject[waitingList[i]] = [maxPlayers, i + 1];
  }

  process.nextTick(function () {
    cb(notifyObject);
  });
};
