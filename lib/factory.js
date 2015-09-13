(function () {
  var root = this;

  // Фабрика для строительства объектов игры
  // создает объект игры указанного типа
  // по заданным параметрам
  function Factory(name, params) {
    if (typeof Factory[name] !== 'function') {
      return;
    }

    return new Factory[name](params);
  }

  // добавление конструкторов
  Factory.add = function (data) {
    var name;

    for (name in data) {
      if (data.hasOwnProperty(name)) {
        Factory[name] = data[name];
      }
    }
  };

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Factory;
    }
    exports.Factory = Factory;
  } else {
    if (typeof define === 'function' && define.amd) {
      define('Factory', [], function () {
        return Factory;
      });
    } else {
      root.Factory = Factory;
    }
  }
}.call(this));
