import Publisher from '../../../lib/Publisher.js';

// Singleton UserView

let userView;

export default class UserView {
  constructor(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._displayID = data.displayID;

    this.publisher = new Publisher();

    this._window.onkeydown = event => {
      userView.publisher.emit('keyDown', event);
    };

    this._window.onkeyup = event => {
      userView.publisher.emit('keyUp', event);
    };

    this._window.onresize = () => {
      userView.publisher.emit('resize', {
        width: userView._window.innerWidth,
        height: userView._window.innerHeight,
      });
    };

    this._mPublic = model.publisher;

    this._mPublic.on('init', 'init', this);
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  init() {
    for (const id of this._displayID) {
      const elem = this._document.getElementById(id);

      if (elem) {
        elem.style.display = 'block';
      }
    }
  }

  // изменение размеров
  resize(sizes) {
    for (const id of Object.keys(sizes)) {
      const elem = this._document.getElementById(id);

      if (elem) {
        elem.style.width = `${sizes[id].width}px`;
        elem.style.height = `${sizes[id].height}px`;
      }
    }

    this.publisher.emit('redraw', sizes);
  }
}
