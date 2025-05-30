import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

export default class shotEffect extends Container {
  // Можно и просто Graphics, если не нужны доп. контейнеры
  constructor(data) {
    super();

    this.startPositionX = data[0];
    this.startPositionY = data[1];
    this.endPositionX = data[2];
    this.endPositionY = data[3];

    this.config = {
      color: 0xffff99, // цвет трассера
      thickness: 1.5, // толщина линии
      duration: 80, // время жизни трассера в мс
      alphaStart: 0.9, // начальная прозрачность
      alphaEnd: 0, // конечная прозрачность
      // множитель длины "хвоста" трассера (если он не просто линия)
      trailLength:
        Math.hypot(
          endPositionX - startPositionX,
          endPositionY - startPositionY,
        ) * 0.1, // длина "хвоста" 10% от общей
      // ... другие параметры, если нужны (например, текстура)
    };

    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.elapsedTime = 0;
    this.isComplete = false;
  }

  // стартует анимацию и после выполнения уничтожает эффект
  start() {
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0); // первый вызов для отрисовки
  }

  _update(deltaMS) {
    if (this.isComplete) return;

    this.elapsedTime += deltaMS;
    let progress = Math.min(this.elapsedTime / this.config.duration, 1);

    this.graphics.clear();

    if (progress < 1) {
      const currentAlpha = lerp(
        this.config.alphaStart,
        this.config.alphaEnd,
        progress,
      );

      // Вариант 1: Простая линия, угасающая по всей длине
      // this.graphics.moveTo(this.startPositionX, this.startPositionY);
      // this.graphics.lineTo(this.endPositionX, this.endPositionY);
      // this.graphics.stroke({ width: this.config.thickness, color: this.config.color, alpha: currentAlpha });

      // Вариант 2: "Летящий" отрезок (голова трассера)
      // Голова трассера движется от startPosition к endPosition
      const headX = lerp(this.startPositionX, this.endPositionX, progress);
      const headY = lerp(this.startPositionY, this.endPositionY, progress);

      // Хвост трассера следует за головой. Длина хвоста постоянна или уменьшается.
      // Для простоты, сделаем так, что "начало" видимого отрезка тоже движется,
      // создавая эффект короткого летящего луча.
      const tailProgress = Math.min(
        this.elapsedTime /
          (this.config.duration *
            (1 +
              this.config.trailLength /
                Math.hypot(
                  this.endPositionX - this.startPositionX,
                  this.endPositionY - this.startPositionY,
                ) || 1)),
        1,
      );
      //const tailProgress = Math.max(0, progress - (this.config.trailLength / Math.hypot(this.endPositionX - this.startPositionX, this.endPositionY - this.startPositionY || 1)));

      let tailX, tailY;
      // Если мы хотим, чтобы хвост всегда был фиксированной длины ОТНОСИТЕЛЬНО НАПРАВЛЕНИЯ ДВИЖЕНИЯ
      // и исчезал вместе с головой, то нужно вычислять его от головы назад
      const dx = this.endPositionX - this.startPositionX;
      const dy = this.endPositionY - this.startPositionY;
      const totalDist = Math.hypot(dx, dy);
      if (totalDist > 0) {
        const nx = dx / totalDist; // Нормализованный вектор направления
        const ny = dy / totalDist;
        // Голова "пролетела" progress * totalDist
        // Хвост должен быть позади головы на this.config.trailLength
        // Точка начала хвоста:
        const currentTrailLength = lerp(
          this.config.trailLength,
          0,
          progress * progress,
        ); // Хвост укорачивается
        tailX = headX - nx * currentTrailLength;
        tailY = headY - ny * currentTrailLength;
      } else {
        // Если start и end совпадают (например, выстрел в упор)
        tailX = headX;
        tailY = headY;
      }

      this.graphics.moveTo(tailX, tailY);
      this.graphics.lineTo(headX, headY);
      this.graphics.stroke({
        width: this.config.thickness,
        color: this.config.color,
        alpha: currentAlpha,
        cap: Graphics.LINE_CAP.ROUND,
      });
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
