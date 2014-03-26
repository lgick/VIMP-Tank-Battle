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

  return StatModel;
});
