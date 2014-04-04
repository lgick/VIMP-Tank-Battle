define(['Publisher'], function (Publisher) {
  // Singleton StatView
  var statView;

  function StatView(model, data) {
    if (statView) {
      return statView;
    }

    statView = this;

    this._stat = data.stat;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;

    this._mPublic.on('open', 'open', this);
    this._mPublic.on('close', 'close', this);
  }

  // открывает статистику
  StatView.prototype.open = function () {
    this._stat.style.display = 'block';
  };

  // закрывает статистику
  StatView.prototype.close = function () {
    this._stat.style.display = 'none';
  };

  return StatView;
});
