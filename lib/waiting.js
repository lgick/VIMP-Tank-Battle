var config = require('./config');

var waitingList = [];
var currentPlayers = [];
var maxPlayers = config.get('server:maxPlayers');

// проверяет наличие свободные мест
exports.check = function (id, cb) {
  var res = false;

  if (currentPlayers.length < maxPlayers) {
    currentPlayers.push(id);
    res = true;
  }

  process.nextTick(function () {
    cb(res);
  });
};

// добавляет ожидающего
exports.add = function (id, cb) {
  waitingList.push(id);

  process.nextTick(function () {
    cb([maxPlayers, waitingList.length]);
  });
};

// удаляет данных
exports.remove = function (id) {
  var i
    , len;

  for (i = 0, len = currentPlayers.length; i < len; i += 1) {
    if (currentPlayers[i] === id) {
      currentPlayers.splice(i, 1);
    }
  }

  for (i = 0, len = waitingList.length; i < len; i += 1) {
    if (waitingList[i] === id) {
      waitingList.splice(i, 1);
    }
  }
};

// возвращает ожидающего и удаляет его из листа
exports.getNext = function (cb) {
  var id;

  if (currentPlayers.length < maxPlayers) {
    id = waitingList.shift();

    if (id) {
      currentPlayers.push(id);
    }
  }

  process.nextTick(function () {
    cb(id);
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
