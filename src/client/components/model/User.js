import Publisher from '../../../lib/Publisher.js';

// Singleton UserModel

let userModel;

export default class UserModel {
  constructor(data) {
    if (userModel) {
      return userModel;
    }

    userModel = this;

    this._sizeOptions = data.sizeOptions;

    this._keySetList = data.keys.keySetList;
    this._modes = data.keys.modes;
    this._cmds = data.keys.cmds;

    this._currentKeySet = this._keySetList[0]; // текущий набор клавиш
    this._currentModes = {}; // статусы режимов
    this._pressedKeys = {}; // объект для хранения состояния зажатых клавиш
    this._areKeysEnabled = false; // статус возможности нажатия клавиш

    this.publisher = new Publisher();
  }

  // добавляет команду
  addKey(event) {
    const keyCode = event.keyCode;
    const mode = this._modes[keyCode];
    const cmd = this._cmds[keyCode];

    // если запрет на ввод клавиш,
    // то доступны только stat и chat
    if (
      this._areKeysEnabled === false &&
      mode !== 'stat' &&
      mode !== 'chat' &&
      !this._currentModes.chat
    ) {
      return;
    }

    // если чат активен
    if (this._currentModes.chat) {
      if (cmd) {
        this.publisher.emit('chat', cmd);
      }

      if (mode === 'stat') {
        event.preventDefault();
        this.publisher.emit('mode', mode);
      }
    } else {
      // если клавиша ещё не зажата
      if (!this._pressedKeys[keyCode]) {
        const name = this._currentKeySet[keyCode];

        if (name) {
          this._pressedKeys[keyCode] = true;
          this.publisher.emit('socket', `down:${name}`);
        }
      }

      if (this._currentModes.vote) {
        this.publisher.emit('vote', keyCode);
      }

      if (this._currentModes.stat) {
        event.preventDefault();
      }

      if (mode) {
        event.preventDefault();
        this.publisher.emit('mode', mode);
      }
    }
  }

  // удаляет команду
  removeKey(event) {
    const keyCode = event.keyCode;
    const mode = this._modes[keyCode];

    // если клавиша была зажата
    if (this._pressedKeys[keyCode]) {
      const name = this._currentKeySet[keyCode];

      if (name) {
        this._pressedKeys[keyCode] = false;
        this.publisher.emit('socket', `up:${name}`);
      }
    }

    if (this._currentModes.stat && mode === 'stat') {
      this.publisher.emit('stat');
    }
  }

  // меняет состояние режима
  setMode(mode, status) {
    if (status === 'opened') {
      this._currentModes[mode] = true;
    } else if (status === 'closed') {
      this._currentModes[mode] = false;
    }
  }

  // меняет набор клавиш
  changeKeySet(key) {
    this._currentKeySet = this._keySetList[key];
    this._pressedKeys = {};
  }

  // рассчитывает размеры элементов с учетом пропорций
  resize(data) {
    const screenWidth = data.width;
    const screenHeight = data.height;
    const sizes = {};
    let width, height;

    for (const p of Object.keys(this._sizeOptions)) {
      const fixSize = this._sizeOptions[p].fixSize;
      const screenRatio = this._sizeOptions[p].screenRatio || 1;
      const aspectRatio = this._sizeOptions[p].aspectRatio;

      // если есть фиксированный размер полотна
      if (fixSize) {
        const parts = fixSize.split(':');

        width = +parts[0];
        height = +parts[1] ? parts[1] : parts[0];
      } else {
        // если задано соотношение сторон
        if (aspectRatio) {
          const parts = aspectRatio.split(':');

          // строку в число
          const widthRatio = parseInt(parts[0], 10);
          const heightRatio = parseInt(parts[1], 10);

          width = Math.round(screenWidth * screenRatio);
          height = (width / widthRatio) * heightRatio;

          // если фактическая высота больше полученной,
          // то вычисления производятся относительно высоты
          if (height > screenHeight) {
            height = Math.round(screenHeight * screenRatio);
            width = (height / heightRatio) * widthRatio;
          }
        } else {
          width = Math.round(screenWidth * screenRatio);
          height = Math.round(screenHeight * screenRatio);
        }

        // Приводим к числу с целым значением
        width = +width.toFixed();
        height = +height.toFixed();
      }

      sizes[p] = { width, height };
    }

    this.publisher.emit('resize', sizes);
  }

  // задаёт возможность нажатия клавиш
  // (stat и chat доступны при любом значении)
  setKeysEnabled(isEnabled) {
    this._areKeysEnabled = isEnabled;
  }
}
