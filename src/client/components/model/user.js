import Publisher from '../../../server/lib/publisher.js';

// Singleton UserModel

let userModel;

export default class UserModel {
  constructor(data) {
    if (userModel) {
      return userModel;
    }

    userModel = this;

    this._window = data.window;

    this._parseInt = this._window.parseInt;
    this._Math = this._window.Math;

    this._sizeOptions = data.sizeOptions;

    this._keySetList = data.keys.keySetList;
    this._modes = data.keys.modes;
    this._cmds = data.keys.cmds;

    this._ticker = data.ticker;

    this._currentKeySet = this._keySetList[0]; // текущий набор клавиш
    this._currentModes = {}; // статусы режимов
    this._keys = 0; // состояние клавиш
    this._keysOneShot = 0; // состояние клавиш одиночного нажатия
    this._keysOneShotData = {}; // данные активности oneShot-клавиш

    this.publisher = new Publisher();
  }

  // инициализация
  init() {
    // запуск счетчика игры
    this._ticker.addEventListener('tick', this.sendKeys.bind(this));

    this.publisher.emit('init');
  }

  // добавляет команду
  addKey(event) {
    const keyCode = event.keyCode;
    const mode = this._modes[keyCode];
    const cmd = this._cmds[keyCode];

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
      this.updateKeysState(keyCode, true);

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

    this.updateKeysState(keyCode, false);

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
  changeKeySet(keySet) {
    this._currentKeySet = this._keySetList[keySet];
    this._keys = 0;
    this._keysOneShot = 0;
  }

  // обновляет набор состояния клавиш
  // Данные объекта нажатой клавиши:
  // - key- число клавиши
  // - type- тип отработки нажатия на клавишу
  // 0 : многократное нажатие (начинается на keyDown, завершается на keyUp)
  // 1 : выполняется один раз на keyDown
  // 2 : выполняется один раз на keyUp
  updateKeysState(keyCode, press) {
    const keyData = this._currentKeySet[keyCode];

    if (keyData) {
      const key = keyData.key;
      const type = keyData.type;

      // если нажатие
      if (press) {
        // если тип не назначен (либо тип 0)
        if (!type) {
          this._keys = this._keys | key;

          // иначе если одна команда (первый тип) и она еще не была активирована
        } else if (type === 1 && this._keysOneShotData[key] !== true) {
          this._keysOneShot = this._keysOneShot | key;
          this._keysOneShotData[key] = true;
        }

        // иначе отжатие
      } else {
        // если тип не назначен (либо тип 0)
        if (!type) {
          this._keys = this._keys & ~key;

          // иначе если одна команда (первый тип)
        } else if (type === 1) {
          this._keysOneShotData[key] = false;

          // иначе если команда на отжатие (второй тип)
        } else if (type === 2) {
          this._keysOneShot = this._keysOneShot | key;
        }
      }
    }
  }

  // отправляет информацию о клавишах на сервер
  sendKeys() {
    const keys = this._keys | this._keysOneShot;

    // если есть команды, то отправка данных
    if (keys !== 0) {
      this.publisher.emit('socket', keys);
      this._keysOneShot = 0;
    }
  }

  // рассчитывает размеры элементов с учетом пропорций
  resize(data) {
    const screenWidth = data.width;
    const screenHeight = data.height;
    const sizes = {};
    let width, height;

    for (const p of Object.keys(this._sizeOptions)) {
      const screenRatio = this._sizeOptions[p].screenRatio || 1;
      const aspectRatio = this._sizeOptions[p].aspectRatio;

      // если задано соотношение сторон
      if (aspectRatio) {
        const parts = aspectRatio.split(':');

        // строку в число
        const widthRatio = this._parseInt(parts[0], 10);
        const heightRatio = this._parseInt(parts[1], 10);

        width = this._Math.round(screenWidth * screenRatio);
        height = (width / widthRatio) * heightRatio;

        // если фактическая высота больше полученной,
        // то вычисления производятся относительно высоты
        if (height > screenHeight) {
          height = this._Math.round(screenHeight * screenRatio);
          width = (height / heightRatio) * widthRatio;
        }
      } else {
        width = this._Math.round(screenWidth * screenRatio);
        height = this._Math.round(screenHeight * screenRatio);
      }

      // Приводим к числу с целым значением
      width = +width.toFixed();
      height = +height.toFixed();

      sizes[p] = { width, height };
    }

    this.publisher.emit('resize', sizes);
  }
}
