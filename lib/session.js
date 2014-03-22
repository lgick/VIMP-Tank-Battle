var log = require('../lib/log')(module);

var config = require('../config');
var User = config.get('game:classUser');

// создает
exports.create = function (data) {
  log.info(data);
};

// возвращает
exports.read = function () {
};

// обновляет
exports.update = function (data) {
  var x = parseInt(data, 36).toString(2);
};

// удаляет
exports.remove = function () {
};
