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

    // текущие смещения камеры (для плавности)
    this._camOffsetX = 0;
    this._camOffsetY = 0;
    this._camZoomModifier = 1;

    // средние значения вектора движения и скорости
    this._avgDx = 0;
    this._avgDy = 0;
    this._avgSpeed = 0;

    // ширина экрана, при которой масштаб игры = 1.0 * baseScale
    // если экран меньше этого значения,
    // картинка canvas будет пропорционально уменьшаться
    this._designWidth = 1920; // Full HD

    // настройки камеры из конфига
    const camConfig = data.dynamicCamera || {};

    this._lookAheadFactor = camConfig.lookAheadFactor || 0;

    // dead zone по правилу "0.5 пикселя"
    const safeFactor = Math.max(this._lookAheadFactor, 1);

    // если lookAheadFactor = 30, deadZone ≈ 0.016
    // если lookAheadFactor = 0,deadZone = 0.5
    this._deadZone = 0.5 / safeFactor;

    let rawZoomFactor = camConfig.zoomOutFactor || 0;

    // ограничение рамками 0-9
    rawZoomFactor = Math.max(0, Math.min(9, rawZoomFactor));
    this._zoomOutFactor = rawZoomFactor * 0.1;

    this._maxZoomOut = camConfig.maxZoomOut || 1;

    // плавность изменений динамической камеры:
    this._smoothnessPosition = camConfig.smoothnessPosition || 0.05;
    this._smoothnessZoom = camConfig.smoothnessZoom || 0.005;
    this._smoothnessVelocity = camConfig.smoothnessVelocity || 0.1;

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
          sizes: { width, height },
        });
      }
    }

    this.updateCoords(this._coordX, this._coordY);
  }

  // вычисляет координаты для отображения
  updateCoords(x, y, cameraReset) {
    // если сброс динамических данных камеры (телепорт/респаун/смена игрока)
    if (cameraReset) {
      this._coordX = x;
      this._coordY = y;

      // сброс инерции камеры (смещение и зум)
      this._camOffsetX = 0;
      this._camOffsetY = 0;
      this._camZoomModifier = 1;

      // сброс накопителя сглаживания скорости
      this._avgDx = 0;
      this._avgDy = 0;
      this._avgSpeed = 0;
    }

    // расчет движения
    // если был сброс, dx/dy будут равны 0 (т.к. только что обновился _coordX/Y)
    let dx = x - this._coordX;
    let dy = y - this._coordY;

    // скорость движения
    let speed = Math.sqrt(dx * dx + dy * dy);

    // если движение медленнее порога dead zone
    if (speed < this._deadZone) {
      dx = 0;
      dy = 0;
      speed = 0;
    }

    // фильтрация шума скорости (позволяет игнорировать сетевой джиттер)
    this._avgDx = lerp(this._avgDx, dx, this._smoothnessVelocity);
    this._avgDy = lerp(this._avgDy, dy, this._smoothnessVelocity);
    this._avgSpeed = lerp(this._avgSpeed, speed, this._smoothnessVelocity);

    // сдвиг камеры в сторону движения
    const targetOffsetX = this._avgDx * this._lookAheadFactor;
    const targetOffsetY = this._avgDy * this._lookAheadFactor;

    // зум: чем быстрее, тем меньше масштаб (отдаление)
    const targetZoomModifier = Math.max(
      this._maxZoomOut,
      1 - this._avgSpeed * this._zoomOutFactor,
    );

    // сглаживание движения камеры
    this._camOffsetX = lerp(
      this._camOffsetX,
      targetOffsetX,
      this._smoothnessPosition,
    );
    this._camOffsetY = lerp(
      this._camOffsetY,
      targetOffsetY,
      this._smoothnessPosition,
    );

    // сглаживание зума
    this._camZoomModifier = lerp(
      this._camZoomModifier,
      targetZoomModifier,
      this._smoothnessZoom,
    );

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
