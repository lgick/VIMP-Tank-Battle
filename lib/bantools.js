var config = require('../config');
var banlist = config.get('game:banlist');

// проверяет наличие ip в банлисте
exports.check = function (ip) {
  var subip = ip.split('.').slice(0, 2).join('.');

  if (banlist[subip]) {
    return banlist[subip];
  } else if (banlist[ip]) {
    return banlist[ip];
  }
};

// добавляет в банлист
exports.add = function (ip, params) {
};

// удаляет из банлиста
exports.remove = function (ip) {
};
