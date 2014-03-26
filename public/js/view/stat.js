define(['Publisher'], function (Publisher) {
  // Singleton StatView
  var statView;

  function StatView(model, data) {
    if (statView) {
      return statView;
    }

    statView = this;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;
  }

  return StatView;
});
