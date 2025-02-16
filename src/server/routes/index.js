export default app => {
  app.get('/', function (req, res, next) {
    res.render('index', {});
  });
};
