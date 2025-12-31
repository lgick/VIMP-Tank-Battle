import Publisher from '../../../lib/Publisher.js';

// линейная интерполяция
function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

// Singleton CanvasManagerModel

let canvasManagerModel;

export default class CanvasManagerModel {
  constructor(data) {
    if (canvasManagerModel) {
      return canvasManagerModel;
    }

    canvasManagerModel = this;

    this._data = {};
    this._coordX = 0; // текущая координата X игрока
    this._coordY = 0; // текущая координата Y игрока

    // координаты рассчёта физики камеры
    this._prevCoordX = null;
    this._prevCoordY = null;

    // сглаженный вектор скорости (фильтр шума сети)
    this._avgDx = 0;
    this._avgDy = 0;

    // текущие смещения камеры (для плавности)
    this._camOffsetX = 0;
    this._camOffsetY = 0;
    this._camZoomModifier = 1;

    // настройки камеры из конфига
    const camConfig = data.dynamicCamera || {};

    this._lookAheadFactor = camConfig.lookAheadFactor || 0;

    let rawZoomFactor = camConfig.zoomOutFactor || 0;

    // ограничение рамками 0-9
    rawZoomFactor = Math.max(0, Math.min(9, rawZoomFactor));
    this._zoomOutFactor = rawZoomFactor * 0.1;

    this._maxZoomOut = camConfig.maxZoomOut || 1;
    this._smoothness = camConfig.smoothness || 1;
    this._inputSmoothness = camConfig._inputSmoothness || 0.1;

    // ширина экрана, при которой масштаб игры = 1.0 * baseScale
    // если экран меньше этого значения,
    // картинка canvas будет пропорционально уменьшаться
    this._designWidth = 1920; // Full HD

    const canvases = data.canvases || {};

    for (const canvasName in canvases) {
      if (Object.hasOwn(canvases, canvasName)) {
        const canvasData = canvases[canvasName];
        const [w, h] = (canvasData.baseScale || '1:1')
          .split(':')
          .map(value => Number(value));
        const baseScale = Number((w / h).toFixed(2));

        this._data[canvasName] = {
          ...canvasData,
          baseScale,
          currentScale: baseScale,
          dynamicCamera: !!canvasData.dynamicCamera,
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
        const { fixSize, aspectRatio, baseScale } = this._data[canvasName];
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

            width = screenWidth;
            height = (width / widthRatio) * heightRatio;

            // если фактическая высота больше полученной,
            // то вычисления производятся относительно высоты
            if (height > screenHeight) {
              height = screenHeight;
              width = (height / heightRatio) * widthRatio;
            }
          } else {
            width = screenWidth;
            height = screenHeight;
          }

          width = +width.toFixed();
          height = +height.toFixed();

          this._data[canvasName].currentScale =
            (width / this._designWidth) * baseScale;
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

    this.updateCoords({ x: this._coordX, y: this._coordY }, true);
  }

  // вычисляет координаты для отображения
  updateCoords(coords, forceReset = false) {
    const x = coords.x;
    const y = coords.y;

    // инициализация предыдущих координат при первом запуске
    if (this._prevCoordX === null) {
      this._prevCoordX = x;
      this._prevCoordY = y;
    }

    // расчет скорости (вектор движения)
    let dx = x - this._prevCoordX;
    let dy = y - this._prevCoordY;

    // если был скачок координат (телепорт), обнуление дельты
    if (Math.abs(dx) > 100 || Math.abs(dy) > 100 || forceReset) {
      dx = 0;
      dy = 0;
      this._avgDx = 0;
      this._avgDy = 0;
      this._camOffsetX = 0;
      this._camOffsetY = 0;
      this._camZoomModifier = 1;
    }

    // фильтрация "шума" (low-pass filter)
    // если приходят нули между движениями,
    // этот фильтр не даст скорости упасть мгновенно
    this._avgDx = lerp(this._avgDx, dx, this._inputSmoothness);
    this._avgDy = lerp(this._avgDy, dy, this._inputSmoothness);

    // защита от бесконечно малых значений (дрейфа камеры в покое)
    if (Math.abs(this._avgDx) < 0.01) {
      this._avgDx = 0;
    }

    if (Math.abs(this._avgDy) < 0.01) {
      this._avgDy = 0;
    }

    // скорость движения
    const speed = Math.sqrt(
      this._avgDx * this._avgDx + this._avgDy * this._avgDy,
    );

    // сдвиг камеры в сторону движения
    const targetOffsetX = this._avgDx * this._lookAheadFactor;
    const targetOffsetY = this._avgDy * this._lookAheadFactor;

    // зум: чем быстрее, тем меньше масштаб (отдаление)
    const targetZoomModifier = Math.max(
      this._maxZoomOut,
      1 - speed * this._zoomOutFactor,
    );

    // сглаживание (lerp)
    this._camOffsetX = lerp(this._camOffsetX, targetOffsetX, this._smoothness);
    this._camOffsetY = lerp(this._camOffsetY, targetOffsetY, this._smoothness);
    this._camZoomModifier = lerp(
      this._camZoomModifier,
      targetZoomModifier,
      this._smoothness,
    );

    this._prevCoordX = x;
    this._prevCoordY = y;
    this._coordX = x;
    this._coordY = y;

    for (const canvasName in this._data) {
      if (Object.hasOwn(this._data, canvasName)) {
        const { dynamicCamera, currentScale } = this._data[canvasName];

        // если для полотна включена динамическая камера
        if (dynamicCamera) {
          const camX = x + this._camOffsetX;
          const camY = y + this._camOffsetY;
          const finalScale = currentScale * this._camZoomModifier;

          this.publisher.emit('updateCoords', {
            id: canvasName,
            coords: {
              x: camX,
              y: camY,
            },
            scale: finalScale,
          });
        } else {
          // если динамическая камера выключена
          this.publisher.emit('updateCoords', {
            id: canvasName,
            coords: { x, y },
            scale: currentScale,
          });
        }
      }
    }
  }
}
