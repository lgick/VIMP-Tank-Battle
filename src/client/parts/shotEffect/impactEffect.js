import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

// Функция для случайного числа в диапазоне
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export default class ImpactEffect extends Container {
  constructor(x, y, config = {}) {
    // Убираем parentContainer из конструктора
    super();
    this.x = x;
    this.y = y;

    this.defaultConfig = {
      particleCount: randomRange(5, 9), // количество частиц/лучей
      particleMinSize: 1.5, // минимальный размер/толщина луча
      particleMaxSize: 3.5, // максимальный размер/толщина луча
      expansionMinSpeed: 50, // минимальная скорость разлета частиц/расширения лучей (пикс/сек)
      expansionMaxSpeed: 120, // максимальная скорость разлета (пикс/сек)
      duration: 280, // общая длительность эффекта в мс
      color: 0xfff59d, // цвет вспышки/частиц
      alphaStart: 0.9,
      alphaEnd: 0,
      shape: 'lines', // 'lines', 'circles'
      lineWidthToLengthRatio: 0.2, // для 'lines', соотношение толщины к длине (длина будет speed * ratio)
    };

    this.config = { ...this.defaultConfig, ...config };

    this.particles = [];
    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.elapsedTime = 0;
    this.isComplete = false;
    this.zIndex = 3;

    this._createParticles();
  }

  _createParticles() {
    for (let i = 0; i < this.config.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        randomRange(
          this.config.expansionMinSpeed,
          this.config.expansionMaxSpeed,
        ) / 1000;
      const size = randomRange(
        this.config.particleMinSize,
        this.config.particleMaxSize,
      );

      this.particles.push({
        angle,
        speed, // скорость расширения от центра
        currentRadius: 0, // текущее расстояние от центра
        size, // используется как толщина для линий или радиус для кругов
      });
    }
  }

  run() {
    // Мы ожидаем, что ImpactEffect будет добавлен на сцену перед вызовом run()
    // или его добавит ShotEffect. Если его нужно добавить независимо:
    // if (targetContainer && !this.parent) {
    //   targetContainer.addChild(this);
    // }

    // Если эффект не был добавлен на сцену родителем (например, ShotEffect), он не запустится.
    // Это теперь ответственность вызывающего кода (ShotEffect) добавить ImpactEffect на сцену.

    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  _update(deltaMS) {
    if (this.isComplete) return;

    this.elapsedTime += deltaMS;
    const progress = Math.min(this.elapsedTime / this.config.duration, 1);

    this.graphics.clear();

    if (progress < 1) {
      // общая альфа для всего эффекта, затухает со временем
      // можно сделать затухание более резким к концу, например, progress * progress
      const currentGlobalAlpha = lerp(
        this.config.alphaStart,
        this.config.alphaEnd,
        Math.pow(progress, 1.5),
      );

      for (const particle of this.particles) {
        // частицы "разлетаются" от центра
        particle.currentRadius += particle.speed * deltaMS;

        // размер/толщина может также уменьшаться со временем
        const currentSize = lerp(particle.size, particle.size * 0.3, progress);

        if (this.config.shape === 'circles') {
          this.graphics
            .circle(
              Math.cos(particle.angle) * particle.currentRadius, // x
              Math.sin(particle.angle) * particle.currentRadius, // y
              currentSize, // радиус круга
            )
            .fill({ color: this.config.color, alpha: currentGlobalAlpha });
        } else {
          // 'lines'
          const x1 = 0; // Math.cos(particle.angle) * (particle.currentRadius * 0.7); // Если хотим, чтобы линия "отъезжала"
          const y1 = 0; // Math.sin(particle.angle) * (particle.currentRadius * 0.7);
          const x2 = Math.cos(particle.angle) * particle.currentRadius;
          const y2 = Math.sin(particle.angle) * particle.currentRadius;

          // чтобы линия не была слишком тонкой в конце
          const lineWidth = Math.max(
            currentSize * (1 - progress * 0.8),
            this.config.particleMinSize * 0.5,
          );

          this.graphics.moveTo(x1, y1);
          this.graphics.lineTo(x2, y2);
          this.graphics.stroke({
            width: lineWidth,
            color: this.config.color,
            alpha: currentGlobalAlpha,
            cap: 'round',
          });
        }
      }
    } else {
      this.isComplete = true;
      this._destroyEffectInternal();
    }
  }

  _destroyEffectInternal() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
    this.graphics.clear();
    if (this.parent) {
      this.parent.removeChild(this);
    }
    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
