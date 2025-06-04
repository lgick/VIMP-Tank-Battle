import { Graphics, Ticker, Container } from 'pixi.js';

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

export default class TracerEffect extends Container {
  constructor(startX, startY, endX, endY, onComplete) {
    super();

    this.startPositionX = startX;
    this.startPositionY = startY;
    this.endPositionX = endX;
    this.endPositionY = endY;
    this.onComplete = onComplete; // callback анимация завершена

    this.config = {
      color: 0xffff99, // цвет трассера
      thickness: 3, // толщина линии
      alphaStart: 0.95, // начальная прозрачность
      alphaEnd: 1, // конечная прозрачность
      trailLength: 40, // фиксированная максимальная длина видимой части трассера в пикселях
      tracerSpeed: 3000, // желаемая скорость "головы" трассера в пикселях в секунду
      minDuration: 40, // минимальная длительность анимации в мс
      maxDuration: 250, // максимальная длительность анимации в мс
      trailShrinkPower: 1.5, // коэффициент для скорости укорачивания хвоста
    };

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.elapsedTime = 0;
    this.isComplete = false;

    // предварительные расчеты для направления и дистанции
    this.dx = this.endPositionX - this.startPositionX;
    this.dy = this.endPositionY - this.startPositionY;
    this.totalDist = Math.hypot(this.dx, this.dy);

    if (this.totalDist > 0.001) {
      this.nx = this.dx / this.totalDist; // нормализованный вектор направления X
      this.ny = this.dy / this.totalDist; // нормализованный вектор направления Y
    } else {
      // если выстрел "в себя" или дистанция нулевая
      this.nx = 0;
      this.ny = 0;
      this.totalDist = 0;
    }

    // длительность анимации на основе расстояния и скорости
    if (this.totalDist > 0.001) {
      // tracerSpeed в пикселях/секунду, длительность в мс
      this.animationDuration =
        (this.totalDist / this.config.tracerSpeed) * 1000;
    } else {
      // для выстрела "в точку" или очень короткого используем minDuration
      this.animationDuration = this.config.minDuration;
    }

    // ограничения длительности сверху и снизу
    this.animationDuration = Math.max(
      this.config.minDuration,
      this.animationDuration,
    );

    this.animationDuration = Math.min(
      this.config.maxDuration,
      this.animationDuration,
    );
  }

  // стартует анимацию
  run() {
    if (this.isComplete) {
      return;
    }

    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0); // первый вызов для отрисовки
  }

  _update(deltaMS) {
    if (this.isComplete) {
      return;
    }

    this.elapsedTime += deltaMS;

    // progress рассчитывается относительно динамической animationDuration
    let progress = Math.min(this.elapsedTime / this.animationDuration, 1);

    this.graphics.clear();

    if (progress < 1) {
      const currentAlpha = lerp(
        this.config.alphaStart,
        this.config.alphaEnd,
        progress,
      );

      // голова трассера движется от startPosition к endPosition
      const headX = lerp(this.startPositionX, this.endPositionX, progress);
      const headY = lerp(this.startPositionY, this.endPositionY, progress);

      // хвост трассера: его длина уменьшается со временем.
      // Math.pow(progress, N) позволяет контролировать скорость "сжатия" хвоста.
      const shrinkProgress = Math.pow(progress, this.config.trailShrinkPower);
      const currentMaxTrailLength = lerp(
        this.config.trailLength, // начальная макс. длина хвоста
        0, // конечная длина хвоста (ноль)
        shrinkProgress, // прогресс сжатия хвоста
      );

      let tailX, tailY;

      // если выстрел в точку, рисуем просто точку
      // (или очень короткую линию, если currentMaxTrailLength > 0)
      if (this.totalDist === 0) {
        tailX = headX - this.nx * Math.min(1, currentMaxTrailLength);
        tailY = headY - this.ny * Math.min(1, currentMaxTrailLength);
      } else {
        // расстояние, которое прошла голова от начальной точки
        const distCoveredByHead = this.totalDist * progress;

        // фактическая видимая длина хвоста не может быть больше, чем currentMaxTrailLength
        // и не может быть больше, чем расстояние, которое уже пролетела голова.
        // это создает эффект "вытягивания" хвоста из начальной точки.
        const actualVisibleTrailLength = Math.min(
          distCoveredByHead,
          currentMaxTrailLength,
        );

        tailX = headX - this.nx * actualVisibleTrailLength;
        tailY = headY - this.ny * actualVisibleTrailLength;
      }

      // не рисуем линию, если ее длина слишком мала
      const lineLength = Math.hypot(headX - tailX, headY - tailY);

      if (lineLength > 0.5) {
        this.graphics.moveTo(tailX, tailY);
        this.graphics.lineTo(headX, headY);
        this.graphics.stroke({
          width: this.config.thickness,
          color: this.config.color,
          alpha: currentAlpha,
          cap: 'round',
        });
      } else if (progress < 0.5 && this.totalDist === 0) {
        // для выстрела в точку нарисовать маленький круг
        this.graphics
          .circle(headX, headY, this.config.thickness / 2)
          .fill({ color: this.config.color, alpha: currentAlpha });
      }
    } else {
      this.isComplete = true;

      if (this._tickListener) {
        Ticker.shared.remove(this._tickListener);
        this._tickListener = null;
      }

      this.graphics.clear();
      this.onComplete();
    }
  }

  destroy() {
    this.isComplete = true; // _update больше не сработает

    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
