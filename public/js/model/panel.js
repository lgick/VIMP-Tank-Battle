define(['Publisher'], function (Publisher) {
  // Singleton PanelModel
  var panelModel;

  function PanelModel() {
    if (panelModel) {
      return panelModel;
    }

    panelModel = this;

    this.publisher = new Publisher();
  }

  // обновляет данные панели пользователя
  PanelModel.prototype.update = function (data) {
    var name;

    for (name in data) {
      if (data.hasOwnProperty(name)) {
        this.publisher.emit('data', {name: name, value: data[name]});
      }
    }
  };

  return PanelModel;
});
