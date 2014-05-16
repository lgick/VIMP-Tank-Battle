var config = require('./config');

var protocol = config.get('server:protocol');
var domain = config.get('server:domain');
var port = config.get('server:port');

exports.origin = function (origin, cb) {
  var err = false;

  if (origin !== protocol + '//' + domain + ':' + port) {
    err = origin + ' this origin in not valid';
  }

  process.nextTick(function () {
    cb(err);
  });
};
