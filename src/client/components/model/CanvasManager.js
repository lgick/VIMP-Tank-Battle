import Publisher from '../../../lib/Publisher.js';

// Singleton CanvasManagerModel

let canvasManagerModel;

export default class CanvasManagerModel {
  constructor(data) {
    if (canvasManagerModel) {
      return canvasManagerModel;
    }

    canvasManagerModel = this;

    this._data = {};
    this._coordX = 0; // координата X
    this._coordY = 0; // координата Y

    for (const canvasName in data) {
      if (Object.hasOwn(data, canvasName)) {
        const canvasData = data[canvasName];
        const screenRatio = canvasData.screenRatio || 1;
        const [w, h] = (canvasData.baseScale || '1:1')
          .split(':')
          .map(value => Number(value));
        const baseScale = Number((w / h).toFixed(2));

        this._data[canvasName] = {
          ...data[canvasName],
          baseScale,
          screenRatio,
        };
      }
    }

    this.publisher = new Publisher();
  }

  // рассчитывает размеры элементов с учетом пропорций
  resize(data) {
    const screenWidth = data.width;
    const screenHeight = data.height;

    for (const canvasName in this._data) {
      if (Object.hasOwn(this._data, canvasName)) {
        const { fixSize, screenRatio, aspectRatio } = this._data[canvasName];
        let width, height;

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

        this.publisher.emit('resize', {
          id: canvasName,
          sizes: {
            width,
            height,
          },
        });
      }
    }
  }

  // вычисляет координаты для отображения
  updateCoords(coords = { x: this._coordX, y: this._coordY }) {
    const x = coords.x;
    const y = coords.y;

    this._coordX = x;
    this._coordY = y;

    for (const canvasName in this._data) {
      if (Object.hasOwn(this._data, canvasName)) {
        const scale = this._data[canvasName].baseScale;

        this.publisher.emit('updateCoords', {
          id: canvasName,
          coords: {
            x,
            y,
          },
          scale,
        });
      }
    }
  }
}
