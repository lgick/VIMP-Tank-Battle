import config from './config';

const banlist = config.get('game:banlist');

// проверяет наличие ip в банлисте
export const check = function (ip, cb) {
  const subip = ip.split('.').slice(0, 2).join('.');
  let banInfo;

  function getBanInfo(data) {
    if (data) {
      return [
        data.name,
        data.reason,
        (data.time / 1000 / 60 / 60).toFixed(2),
        data.type,
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
export const add = function (ip, params) {};

// удаляет из банлиста
export const remove = function (ip) {};
