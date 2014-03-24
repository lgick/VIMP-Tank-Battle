var config = require('../config');

var auth = config.get('game:auth');

exports.auth = function (data) {
  if (!data) {
    return [{name: 'Authorization', error: 'is failed'}];
  }

  var errors = []
    , params = auth.params
    , i = 0
    , len = params.length
    , name
    , value
    , regExp;

  // проверка на regExp
  for (; i < len; i += 1) {
    name = params[i].name;
    value = data[name];

    if (params[i].options.regExp) {
      regExp = new RegExp(params[i].options.regExp);

      if (!value || !regExp.test(value)) {
        errors.push({name: name, error: 'not valid' });
      }
    }
  }

  if (errors.length) {
    return errors;
  }
};

exports.chat = function (message) {
};
