import Publisher from '../../../lib/publisher.js';

// Singleton PanelModel

let panelModel;

export default class PanelModel {
  constructor(data) {
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
  update(panels) {
    for (let i = 0, len = panels.length; i < len; i += 1) {
      const panel = this._panels[i];
      const value = panels[i];

      // если данные есть (null - данные игнорируются)
      if (value !== null) {
        // если данные для обновления времени игры
        if (panel === 'time') {
          this.updateTime(value);

          // иначе другие данные
        } else {
          this.publisher.emit('data', { name: panel, value });
        }
      }
    }
  }

  // обновляет время
  updateTime(time) {
    let min = ~~(time / 60);
    let sec = time % 60 || 0;

    this._window.clearInterval(this._timer);

    const getTime = () => {
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

      const time = sec < 10 ? `${min}:0${sec}` : `${min}:${sec}`;

      this.publisher.emit('data', { name: 'time', value: time });
    };

    getTime();

    this._timer = this._window.setInterval(getTime, 1000);
  }
}
