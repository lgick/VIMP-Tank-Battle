define([], function () {
  // Observer pattern
  // on: добавляет слушателя
  // emit: рассылает
  function Publisher() {
    this.subs = {};      // подписчики
  }

  Publisher.prototype = {
    // добавляет подписчика в массив
    on: function (type, fn, context) {
      this.subs[type] = this.subs[type] || [];

      if (typeof fn !== 'function') {
        fn = context[fn];
      }

      this.subs[type].push({
        fn: fn,
        context: context || this
      });
    },
    // просматривает список подписчиков
    // и вызывает методы, указанные при
    // оформлении подписки
    emit: function (type, data) {
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
    }
  };

  return Publisher;
});
