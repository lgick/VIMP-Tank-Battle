(function () {
  var root = this;

  // Фабрика для строительства объектов игры
  // создает объект игры указанного типа
  // по заданным параметрам
  function Factory(type, params) {
    if (typeof Factory[type] !== 'function') {
      return;
    }

    return new Factory[type](params);
  }

  // добавление конструктора
  // наделяет конструкторы дополнительными методами
  // каждый добавленный конструктор будет их иметь
  Factory.add = function (name, object) {
    var addons = Factory.prototype._addons
      , p;

    for (p in addons) {
      if (addons.hasOwnProperty(p)) {
        object.prototype[p] = addons[p];
      }
    }

    Factory[name] = object;
  };

  // общие методы, которые наследуют конструкторы
  Factory.prototype._addons = {
    getModel: function () {
      console.log(this.model);
    },
    getColor: function () {
      console.log(this.color);
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
