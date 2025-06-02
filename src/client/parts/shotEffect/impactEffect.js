import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

// Функция для случайного числа в диапазоне
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export class ImpactEffect extends Container {
  constructor(x, y, parentContainer, config = {}) {
    super();
    this.x = x; // Позиция эффекта будет позицией этого контейнера
    this.y = y;
    this.parentContainer = parentContainer; // Контейнер, куда будет добавлен эффект

    this.defaultConfig = {
      particleCount: randomRange(5, 9), // Количество частиц/лучей
      particleMinSize: 1.5, // Минимальный размер/толщина луча
      particleMaxSize: 3.5, // Максимальный размер/толщина луча
      expansionMinSpeed: 50, // Минимальная скорость разлета частиц/расширения лучей (пикс/сек)
      expansionMaxSpeed: 120, // Максимальная скорость разлета (пикс/сек)
      duration: 280, // Общая длительность эффекта в мс
      color: 0xfff59d, // Цвет вспышки/частиц
      alphaStart: 0.9,
      alphaEnd: 0,
      shape: 'lines', // 'lines', 'circles'
      lineWidthToLengthRatio: 0.2, // Для 'lines', соотношение толщины к длине (длина будет speed * ratio)
    };

    this.config = { ...this.defaultConfig, ...config };

    this.particles = [];
    this.graphics = new Graphics();
    this.addChild(this.graphics);

    this.elapsedTime = 0;
    this.isComplete = false;
    this.zIndex = 3; // Поверх трассеров

    this._createParticles();
  }

  _createParticles() {
    for (let i = 0; i < this.config.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed =
        randomRange(
          this.config.expansionMinSpeed,
          this.config.expansionMaxSpeed,
        ) / 1000; // в пикс/мс
      const size = randomRange(
        this.config.particleMinSize,
        this.config.particleMaxSize,
      );

      this.particles.push({
        angle: angle,
        speed: speed, // скорость расширения от центра
        currentRadius: 0, // текущее расстояние от центра
        size: size, // используется как толщина для линий или радиус для кругов
        // можно добавить индивидуальный lifetime decay если нужно
      });
    }
  }

  run() {
    if (this.parentContainer) {
      this.parentContainer.addChild(this);
      // Сортировка по zIndex, если используется общий контейнер для эффектов
      if (this.parentContainer.sortableChildren) {
        this.parentContainer.sortChildren();
      }
    } else {
      console.warn(
        'ImpactEffect: parentContainer не указан, эффект не будет добавлен на сцену.',
      );
      this.isComplete = true;
      this._destroyEffectInternal(); // Используем внутренний метод, чтобы не конфликтовать с PIXI
      return;
    }
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
      // Общая альфа для всего эффекта, затухает со временем
      // Можно сделать затухание более резким к концу, например, progress * progress
      const currentGlobalAlpha = lerp(
        this.config.alphaStart,
        this.config.alphaEnd,
        Math.pow(progress, 1.5),
      );

      for (const particle of this.particles) {
        // Частицы "разлетаются" от центра
        particle.currentRadius += particle.speed * deltaMS;

        // Размер/толщина может также уменьшаться со временем
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

          // Чтобы линия не была слишком тонкой в конце
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

  // Переименовываем, чтобы не конфликтовать с методом destroy() из PIXI.Container
  _destroyEffectInternal() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
    this.graphics.clear();
    if (this.parent) {
      this.parent.removeChild(this);
    }
    // Вызываем оригинальный destroy из PIXI.Container
    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
