define(['Publisher'], function (Publisher) {
  // Singleton PanelModel
  var panelModel;

  function PanelModel(data) {
    if (panelModel) {
      return panelModel;
    }

    panelModel = this;

    this._window = data.window;

    this._panels = data.panels;

    this._timer = null;

    this.publisher = new Publisher();
  }

  // обновляет данные панели пользователя
  PanelModel.prototype.update = function (panels) {
    var i = 0
      , len = panels.length
      , panel
      , value;

    for (; i < len; i += 1) {
      panel = this._panels[i];
      value = panels[i];

      // если данные есть (null - данные игнорируются)
      if (value !== null) {
        // если данные для обновления времени игры
        if (panel === 'time') {
          this.updateTime(value);

        // иначе другие данные
        } else {
          this.publisher.emit('data', {
            name: panel,
            value: value
          });
        }
      }
    }
  };

  // обновляет время
  PanelModel.prototype.updateTime = function (time) {
    var min = ~~(time / 60)
      , sec = time % 60 || 0
      , getTime;

    this._window.clearInterval(this._timer);

    getTime = (function () {
      var time;

      if (sec > 0) {
        sec -= 1;
      } else {
        if (min > 0) {
          min -= 1;
          sec = 59;
        } else {
          this._window.clearInterval(this._timer);
          return;
        }
      }

      if (sec < 10) {
        time = min + ':' + '0' + sec;
      } else {
        time = min + ':' + sec;
      }

      this.publisher.emit('data', {
        name: 'time',
        value: time
      });
    }).bind(this);

    getTime();

    this._timer = this._window.setInterval(getTime, 1000);
  };

  return PanelModel;
});
