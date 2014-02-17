var config = require('../config');

module.exports = function (app) {
  app.get('/', function (req, res, next) {
    res.render('vimp', {
      title: config.get('game:name')
    });
  });
};
