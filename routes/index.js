var config = require('../config');
var title = config.get('basic:name');

module.exports = function (app) {
  app.get('/', function (req, res, next) {
    res.render('vimp', {title: title});
  });
};
