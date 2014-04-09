define(['Publisher'], function (Publisher) {
  // Singleton StatModel
  var statModel;

  function StatModel(data) {
    if (statModel) {
      return statModel;
    }

    statModel = this;

    this._data = {};

    this.publisher = new Publisher();
  }

  // открывает статистику
  StatModel.prototype.open = function () {
    this.publisher.emit('open');

    this.publisher.emit('mode', {
      name: 'stat',
      status: 'opened'
    });
  };

  // обновляет статистику
  StatModel.prototype.close = function () {
    this.publisher.emit('close');

    this.publisher.emit('mode', {
      name: 'stat',
      status: 'closed'
    });
  };

  // обновляет данные
  StatModel.prototype.update = function (data) {
    var name;

    for (name in data) {
      if (data.hasOwnProperty(name)) {
        
      }
    }
  };

  return StatModel;
});
