define(['Publisher'], function (Publisher) {
  // Singleton PanelModel
  var panelModel;

  function PanelModel(routes) {
    if (panelModel) {
      return panelModel;
    }

    panelModel = this;

    this._routes = routes;

    this.publisher = new Publisher();
  }

  // обновляет данные панели пользователя
  PanelModel.prototype.update = function (dataArr) {
    var i = 0
      , len = dataArr.length;

    for (; i < len; i += 1) {
      this.publisher.emit('data', {
        name: this._routes[i],
        value: dataArr[i]
      });
    }
  };

  return PanelModel;
});
