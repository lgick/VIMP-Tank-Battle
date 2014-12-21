(function () {
  var root = this;

  // Observer pattern
  // on: добавляет слушателя
  // emit: рассылает
  function Publisher() {
    this.subs = {};      // подписчики
  }

  // добавляет подписчика в массив
  Publisher.prototype.on = function (type, fn, context) {
    this.subs[type] = this.subs[type] || [];

    if (typeof fn !== 'function') {
      fn = context[fn];
    }

    this.subs[type].push({
      fn: fn,
      context: context || this
    });
  };

  // просматривает список подписчиков
  // и вызывает методы, указанные при
  // оформлении подписки
  Publisher.prototype.emit = function (type, data) {
    var subs = this.subs[type]
      , i
      , len;

    if (subs) {
      i = 0;
      len = subs.length;

      for (; i < len; i += 1) {
        subs[i].fn.call(subs[i].context, data);
      }
    }
  };

  if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = Publisher;
    }
    exports.Publisher = Publisher;
  } else {
    if (typeof define === 'function' && define.amd) {
      define('Publisher', [], function () {
        return Publisher;
      });
    } else {
      root.Publisher = Publisher;
    }
  }

}.call(this));
