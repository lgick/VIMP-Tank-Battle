import config from '../lib/config.js';

const title = config.get('server:name');

export default app => {
  app.get('/', function (req, res, next) {
    res.render('index', { title: title });
  });
};
