var config = require('./config');

var auth = config.get('auth');

exports.auth = function (data) {
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

    // если полученные данные имеют необходимое свойство
    if (name in data) {
      value = data[name];

      // если тип значения не строка
      if (typeof value !== 'string') {
        return [{name: 'Authorization', error: 'type error'}];
      }

      // если есть regExp для проверки
      if (params[i].options.regExp) {
        regExp = new RegExp(params[i].options.regExp);

        if (!regExp.test(value)) {
          errors.push({name: name, error: 'not valid' });
        }
      }
    } else {
      return [{name: 'Authorization', error: 'property error'}];
    }
  }

  if (errors.length) {
    return errors;
  }
};

exports.chat = function (message) {
  return message.replace(/\<|\>|\"|\'|\%|\;|\(|\)|\&|\+|\-/g, '');
};
