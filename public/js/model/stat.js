define(['Publisher'], function (Publisher) {
  // Singleton StatModel
  var statModel;

  function StatModel(data) {
    if (statModel) {
      return statModel;
    }

    statModel = this;

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

  return StatModel;
});
