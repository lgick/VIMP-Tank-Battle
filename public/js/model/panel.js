define(['Publisher'], function (Publisher) {
  // Singleton PanelModel
  var panelModel;

  function PanelModel(panels) {
    if (panelModel) {
      return panelModel;
    }

    panelModel = this;

    this._panels = panels;

    this.publisher = new Publisher();
  }

  // обновляет данные панели пользователя
  PanelModel.prototype.update = function (dataArr) {
    var time = dataArr[0]
      , panels = dataArr[1]
      , i
      , len
      , panel
      , value
    ;

    function getTime(s) {
      var hours = ~~(s / 60)
        , minutes = s % 60;

      if (minutes < 10) {
        minutes = '0' + minutes;
      }

      return hours + ':' + minutes;
    }

    if (typeof time === 'number') {
      this.publisher.emit('data', {
        name: 'time',
        value: getTime(time)
      });
    }

    if (panels === null) {
      for (i = 0, len = this._panels.length; i < len; i += 1) {
        this.publisher.emit('data', {
          name: this._panels[i],
          value: ''
        });
      }
    } else {
      for (i = 0, len = panels.length; i < len; i += 1) {
        if (typeof panels[i] === 'number') {
          panel = this._panels[i];
          value = panels[i];

          this.publisher.emit('data', {
            name: panel,
            value: value
          });
        }
      }
    }
  };

  return PanelModel;
});
