import Publisher from '../../../lib/Publisher.js';

// Singleton PanelModel

let panelModel;

export default class PanelModel {
  constructor(panels) {
    if (panelModel) {
      return panelModel;
    }

    panelModel = this;

    this._panels = panels;
    this.publisher = new Publisher();
  }

  // обновляет данные панели пользователя
  update(panels) {
    for (let i = 0, len = panels.length; i < len; i += 1) {
      const panel = this._panels[i];
      let value = panels[i];

      // если данные есть (null - данные игнорируются)
      if (value !== null) {
        // если данные для обновления времени игры
        if (panel === 'time') {
          value = this.formatTime(value);
        }

        this.publisher.emit('data', { name: panel, value });
      }
    }
  }

  // задаёт формат времени
  formatTime(time) {
    const min = ~~(time / 60);
    const sec = time % 60 || 0;

    return sec < 10 ? `${min}:0${sec}` : `${min}:${sec}`;
  }
}
