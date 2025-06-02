import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

export default class ShotEffect extends Container {
  // Можно и просто Graphics, если не нужны доп. контейнеры
  constructor(data) {
    super();

    this.zIndex = 2;

    this.startPositionX = data[0];
    this.startPositionY = data[1];
    this.endPositionX = data[2];
    this.endPositionY = data[3];

    this.config = {
      color: 0xffff99, // цвет трассера
      thickness: 3, // толщина линии
      alphaStart: 0.95, // начальная прозрачность
      alphaEnd: 1, // конечная прозрачность
      trailLength: 40, // Фиксированная максимальная длина видимой части трассера в пикселях
      tracerSpeed: 3000, // Желаемая скорость "головы" трассера в пикселях в секунду
      minDuration: 40, // Минимальная длительность анимации в мс
      maxDuration: 250, // Максимальная длительность анимации в мс
      // Коэффициент для скорости укорачивания хвоста (progress^N). 1 = линейно, 2 = квадратично (быстрее к концу)
      trailShrinkPower: 1.5,
    };

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.elapsedTime = 0;
    this.isComplete = false;

    // Предварительные расчеты для направления и дистанции
    this.dx = this.endPositionX - this.startPositionX;
    this.dy = this.endPositionY - this.startPositionY;
    this.totalDist = Math.hypot(this.dx, this.dy);

    if (this.totalDist > 0.001) {
      // Избегаем деления на ноль для очень коротких отрезков
      this.nx = this.dx / this.totalDist; // Нормализованный вектор направления X
      this.ny = this.dy / this.totalDist; // Нормализованный вектор направления Y
    } else {
      // Если выстрел "в себя" или дистанция нулевая
      this.nx = 0;
      this.ny = 0;
      this.totalDist = 0; // Убедимся, что это ноль
    }

    // Рассчитываем длительность анимации на основе расстояния и скорости
    if (this.totalDist > 0.001) {
      // tracerSpeed в пикселях/секунду, длительность в мс
      this.animationDuration =
        (this.totalDist / this.config.tracerSpeed) * 1000;
    } else {
      // Для выстрела "в точку" или очень короткого используем minDuration
      this.animationDuration = this.config.minDuration;
    }

    // Ограничиваем длительность сверху и снизу
    this.animationDuration = Math.max(
      this.config.minDuration,
      this.animationDuration,
    );
    this.animationDuration = Math.min(
      this.config.maxDuration,
      this.animationDuration,
    );
  }

  // стартует анимацию и после выполнения уничтожает эффект
  run() {
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0); // первый вызов для отрисовки
  }

  _update(deltaMS) {
    if (this.isComplete) return;

    this.elapsedTime += deltaMS;
    // progress теперь рассчитывается относительно динамической animationDuration
    let progress = Math.min(this.elapsedTime / this.animationDuration, 1);

    this.graphics.clear();

    if (progress < 1) {
      const currentAlpha = lerp(
        this.config.alphaStart,
        this.config.alphaEnd,
        progress, // Альфа по-прежнему зависит от общего прогресса анимации
      );

      // Голова трассера движется от startPosition к endPosition
      const headX = lerp(this.startPositionX, this.endPositionX, progress);
      const headY = lerp(this.startPositionY, this.endPositionY, progress);

      // Хвост трассера: его длина уменьшается со временем.
      // Math.pow(progress, N) позволяет контролировать скорость "сжатия" хвоста.
      const shrinkProgress = Math.pow(progress, this.config.trailShrinkPower);
      const currentMaxTrailLength = lerp(
        this.config.trailLength, // Начальная макс. длина хвоста
        0, // Конечная длина хвоста (ноль)
        shrinkProgress, // Прогресс сжатия хвоста
      );

      let tailX, tailY;

      if (this.totalDist === 0) {
        // Если выстрел в точку, рисуем просто точку (или очень короткую линию, если currentMaxTrailLength > 0)
        tailX = headX - this.nx * Math.min(1, currentMaxTrailLength); // Для очень коротких
        tailY = headY - this.ny * Math.min(1, currentMaxTrailLength);
      } else {
        // Расстояние, которое прошла голова от начальной точки
        const distCoveredByHead = this.totalDist * progress;

        // Фактическая видимая длина хвоста не может быть больше, чем currentMaxTrailLength
        // и не может быть больше, чем расстояние, которое уже пролетела голова.
        // Это создает эффект "вытягивания" хвоста из начальной точки.
        const actualVisibleTrailLength = Math.min(
          distCoveredByHead,
          currentMaxTrailLength,
        );

        tailX = headX - this.nx * actualVisibleTrailLength;
        tailY = headY - this.ny * actualVisibleTrailLength;
      }

      // Не рисуем линию, если ее длина слишком мала
      const lineLength = Math.hypot(headX - tailX, headY - tailY);
      if (lineLength > 0.5) {
        // Порог можно настроить
        this.graphics.moveTo(tailX, tailY);
        this.graphics.lineTo(headX, headY);
        this.graphics.stroke({
          width: this.config.thickness,
          color: this.config.color,
          alpha: currentAlpha,
          cap: 'round',
        });
      } else if (progress < 0.5 && this.totalDist === 0) {
        // Для выстрела в точку можно нарисовать маленький круг
        this.graphics
          .circle(headX, headY, this.config.thickness / 2)
          .fill({ color: this.config.color, alpha: currentAlpha });
      }
    } else {
      this.isComplete = true;
      this._destroyEffect();
    }
  }

  _destroyEffect() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    this.destroy({ children: true });
  }
}
