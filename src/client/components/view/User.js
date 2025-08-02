import Publisher from '../../../lib/Publisher.js';

// Singleton UserView

let userView;

export default class UserView {
  constructor(model, displayIdList) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._displayIdList = displayIdList;

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

    this._mPublic.on('resize', 'resize', this);
  }

  // отображает элементы
  show() {
    for (const id of this._displayIdList) {
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
