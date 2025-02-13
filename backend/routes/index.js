import config from '../lib/config';

const title = config.get('server:name');

export default app => {
  app.get('/', function (req, res, next) {
    res.render('vimp', { title: title });
  });
};
