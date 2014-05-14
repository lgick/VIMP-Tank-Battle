var config = require('../config');

var protocol = config.get('basic:protocol');
var domain = config.get('basic:domain');
var port = config.get('basic:port');

exports.origin = function (origin, cb) {
  var err = false;

  if (origin !== protocol + '//' + domain + ':' + port) {
    err = origin + ' this origin in not valid';
  }

  process.nextTick(function () {
    cb(err);
  });
};
