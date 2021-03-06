var config = require('./config');
var banlist = config.get('game:banlist');

// проверяет наличие ip в банлисте
exports.check = function (ip, cb) {
  var subip = ip.split('.').slice(0, 2).join('.')
    , banInfo;

  function getBanInfo(data) {
    if (data) {
      return [
        data.name,
        data.reason,
        (data.time / 1000 / 60 / 60).toFixed(2),
        data.type
      ];
    }
  }

  if (banlist[subip]) {
    banInfo = getBanInfo(banlist[subip]);
  } else if (banlist[ip]) {
    banInfo = getBanInfo(banlist[ip]);
  }

  if (banInfo) {
    process.nextTick(function () {
      cb(banInfo);
    });
  } else {
    process.nextTick(function () {
      cb(null);
    });
  }
};

// добавляет в банлист
exports.add = function (ip, params) {
};

// удаляет из банлиста
exports.remove = function (ip) {
};
