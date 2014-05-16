var config = require('../lib/config');
var title = config.get('server:name');

module.exports = function (app) {
  app.get('/', function (req, res, next) {
    res.render('vimp', {title: title});
  });
};
