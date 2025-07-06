import Publisher from '../../../lib/Publisher.js';

// Singleton UserView

let userView;

export default class UserView {
  constructor(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._displayId = data.displayId;

    this.publisher = new Publisher();

    onkeydown = event => {
      userView.publisher.emit('keyDown', event);
    };

    onkeyup = event => {
      userView.publisher.emit('keyUp', event);
    };

    onresize = () => {
      userView.publisher.emit('resize', {
        width: innerWidth,
        height: innerHeight,
      });
    };

    this._mPublic = model.publisher;

    this._mPublic.on('init', 'init', this);
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  init() {
    for (const id of this._displayId) {
      const elem = document.getElementById(id);

      if (elem) {
        elem.style.display = 'block';
      }
    }
  }

  // изменение размеров
  resize(sizes) {
    for (const id of Object.keys(sizes)) {
      const elem = document.getElementById(id);

      if (elem) {
        elem.style.width = `${sizes[id].width}px`;
        elem.style.height = `${sizes[id].height}px`;
      }
    }

    this.publisher.emit('redraw', sizes);
  }
}
