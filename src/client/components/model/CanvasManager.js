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

    // Для расчета физики камеры
    this._prevCoordX = null;
    this._prevCoordY = null;

    // Сглаженный вектор скорости (фильтр шума сети)
    this._avgDx = 0;
    this._avgDy = 0;

    // Текущие смещения камеры (для плавности)
    this._camOffsetX = 0;
    this._camOffsetY = 0;
    this._camZoomModifier = 1;

    // 1. Получаем настройки камеры из конфига
    const camConfig = data.dynamicCamera || {};

    this._lookAheadFactor = camConfig.lookAheadFactor || 0;
    this._zoomOutFactor = camConfig.zoomOutFactor || 0;
    this._maxZoomOut = camConfig.maxZoomOut || 1;
    this._smoothness = camConfig.smoothness || 1;
    this._inputSmoothness = camConfig._inputSmoothness || 0.1;

    // Ширина экрана для адаптивного масштабирования
    this._designWidth = 1920; // Full HD

    // 2. Обрабатываем список канвасов (теперь они в data.canvases)
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
          // Сохраняем флаг, нужна ли динамическая камера для этого полотна
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

        // если есть фиксированный размер полотна (например, Радар)
        if (fixSize) {
          const parts = fixSize.split(':');

          width = +parts[0];
          height = +parts[1] ? parts[1] : parts[0];
        } else {
          // если задано соотношение сторон (Основной экран)
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

          // Приводим к числу с целым значением
          width = +width.toFixed();
          height = +height.toFixed();

          // Рассчитываем базовый "статичный" масштаб для текущего разрешения
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

    // При ресайзе сбрасываем эффекты камеры
    this.updateCoords({ x: this._coordX, y: this._coordY }, true);
  }

  // вычисляет координаты для отображения
  updateCoords(coords, forceReset = false) {
    const x = coords.x;
    const y = coords.y;

    // Инициализация предыдущих координат при первом запуске
    if (this._prevCoordX === null) {
      this._prevCoordX = x;
      this._prevCoordY = y;
    }

    // 1. Расчет скорости (вектор движения)
    let dx = x - this._prevCoordX;
    let dy = y - this._prevCoordY;

    // Если был скачок координат (телепорт), обнуляем дельту
    if (Math.abs(dx) > 100 || Math.abs(dy) > 100 || forceReset) {
      dx = 0;
      dy = 0;
      this._avgDx = 0;
      this._avgDy = 0;
      this._camOffsetX = 0;
      this._camOffsetY = 0;
      this._camZoomModifier = 1;
    }

    // 2. Фильтрация "Шума" (Low-pass filter)
    // Если приходят нули между движениями, этот фильтр не даст скорости упасть мгновенно.
    // 0.1 - коэффициент отзывчивости фильтра. Чем меньше, тем плавнее реакция на изменение скорости.
    this._avgDx = lerp(this._avgDx, dx, this._inputSmoothness);
    this._avgDy = lerp(this._avgDy, dy, this._inputSmoothness);

    // Дополнительно: защита от бесконечно малых значений (дрейфа камеры в покое)
    if (Math.abs(this._avgDx) < 0.01) {
      this._avgDx = 0;
    }

    if (Math.abs(this._avgDy) < 0.01) {
      this._avgDy = 0;
    }

    // Скорость движения
    const speed = Math.sqrt(
      this._avgDx * this._avgDx + this._avgDy * this._avgDy,
    );

    // 2. Целевые значения
    // Смещение: сдвигаем камеру в сторону движения
    const targetOffsetX = this._avgDx * this._lookAheadFactor;
    const targetOffsetY = this._avgDy * this._lookAheadFactor;

    // Зум: чем быстрее, тем меньше масштаб (отдаление)
    const targetZoomModifier = Math.max(
      this._maxZoomOut,
      1 - speed * this._zoomOutFactor,
    );

    // 3. Сглаживание (Lerp)
    this._camOffsetX = lerp(this._camOffsetX, targetOffsetX, this._smoothness);
    this._camOffsetY = lerp(this._camOffsetY, targetOffsetY, this._smoothness);
    this._camZoomModifier = lerp(
      this._camZoomModifier,
      targetZoomModifier,
      this._smoothness,
    );

    // Обновляем "историю"
    this._prevCoordX = x;
    this._prevCoordY = y;
    this._coordX = x;
    this._coordY = y;

    for (const canvasName in this._data) {
      if (Object.hasOwn(this._data, canvasName)) {
        const { dynamicCamera, currentScale } = this._data[canvasName];

        // Если для полотна включена динамическая камера (vimp)
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
          // Если динамическая камера выключена (radar)
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
