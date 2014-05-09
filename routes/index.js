var config = require('../config');
var bantools = require('../lib/bantools');

var banmsg = config.get('basic:message:ban');
var title = config.get('game:name');

module.exports = function (app) {
  app.get('/', function (req, res, next) {
    var banInfo = bantools.check(req.connection.remoteAddress);

    if (banInfo) {
      res.render('banned', {info: banInfo, message: banmsg});
    } else {
      res.render('vimp', {title: title});
    }
  });
};
