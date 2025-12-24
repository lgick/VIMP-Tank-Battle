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
    this._cursorTimerId = null;

    this.publisher = new Publisher();

    onkeydown = event => {
      this.publisher.emit('keyDown', event);
    };

    onkeyup = event => {
      this.publisher.emit('keyUp', event);
    };

    onmouseup = onmousedown = onmousemove = () => this._resetCursorHideTimer();

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
  init() {
    for (const id of this._displayIdList) {
      const elem = document.getElementById(id);

      if (elem) {
        elem.style.display = 'block';
      }
    }

    this._resetCursorHideTimer();
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

  // показывает курсор и запускает таймер его сокрытия
  _resetCursorHideTimer() {
    // сбрасывает старый таймер
    clearTimeout(this._cursorTimerId);

    document.body.classList.remove('hide-cursor');

    // запускает новый таймер через 3 секунды бездействия мыши
    this._cursorTimerId = setTimeout(() => {
      document.body.classList.add('hide-cursor');
    }, 3000);
  }
}
