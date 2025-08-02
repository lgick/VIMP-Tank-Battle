import { Sprite } from 'pixi.js';
import BaseEffect from '../BaseEffect.js';

export default class SmokeEffect extends BaseEffect {
  constructor(options = {}, assets) {
    // если вдруг потребуется onComplete для SmokeEffect
    super(options.onComplete);

    this.explosionTexture = assets.explosionTexture;

    this._particles = [];
    this._isSpawning = true;

    // параметры дыма
    this._particleSpawnRateMs = options.spawnRate ?? 1000;
    this._particleMaxLifeMs = options.maxLife ?? 3000;
    this._particleColor = options.color ?? 0x494949;
    this._initialScale = options.initialScale ?? 0.02;
    this._maxScale = options.maxScale ?? 0.04;
    this._initialAlpha = options.initialAlpha ?? 0.25; // начальная прозрачность
    this._initialOffsetX = options.initialOffsetX ?? 3;
    this._initialOffsetY = options.initialOffsetY ?? 3;
    this._stretch = options.stretch ?? 5;

    this._lastSpawnTime = 0;
  }

  stopSpawning() {
    this._isSpawning = false;
  }

  _createParticle() {
    const particle = new Sprite(this.explosionTexture);

    particle.anchor.set(0.5);
    particle.tint = this._particleColor;
    particle.scale.set(this._initialScale);
    particle.alpha = this._initialAlpha;

    // случайный начальный поворот, чтобы сломать прямые линии
    particle.rotation = (Math.random() - 0.5) * 0.5; // небольшой наклон

    particle.x = (Math.random() - 0.5) * this._initialOffsetX;
    particle.y = (Math.random() - 0.5) * this._initialOffsetY;

    particle.customData = {
      life: 0,
      driftX: (Math.random() - 0.5) * 0.2,
      driftY: -Math.random() * 0.35,
      // каждая частица получает свой уникальный множитель растяжения
      // от 80% до 120% от базового
      stretchFactor: this._stretch * (0.8 + Math.random() * 0.4),
    };

    this.addChild(particle);
    this._particles.push(particle);
  }

  _update(deltaMs) {
    if (this.isComplete) {
      return;
    }

    if (this._isSpawning) {
      this._lastSpawnTime += deltaMs;

      if (this._lastSpawnTime > this._particleSpawnRateMs) {
        this._createParticle();
        this._lastSpawnTime = 0;
      }
    }

    for (let i = this._particles.length - 1; i >= 0; i -= 1) {
      const particle = this._particles[i];
      particle.customData.life += deltaMs;

      if (particle.customData.life >= this._particleMaxLifeMs) {
        this.removeChild(particle);
        particle.destroy(); // уничтожение частицы PIXI.Sprite
        this._particles.splice(i, 1);
      } else {
        const progress = particle.customData.life / this._particleMaxLifeMs;
        particle.x += particle.customData.driftX * (deltaMs / 16);
        particle.y += particle.customData.driftY * (deltaMs / 16);

        const scaleGrowth = this._maxScale - this._initialScale;
        const baseScale = this._initialScale + progress * scaleGrowth;

        // уникальный stretchFactor для каждой частицы
        const stretchAmount =
          1 + progress * (particle.customData.stretchFactor - 1);
        particle.scale.set(baseScale, baseScale * stretchAmount);

        // затухание зависит от начальной прозрачности
        if (progress > 0.5) {
          const fadeProgress = (progress - 0.5) * 2;
          particle.alpha = this._initialAlpha * (1 - fadeProgress);
        }
      }
    }

    if (!this._isSpawning && this._particles.length === 0 && this._isStarted) {
      this._completeEffect(); // завершение логики эффекта
      if (!this.destroyed) {
        this.destroy();
      }
    }
  }

  destroy(options) {
    // очистка массива частиц до вызова super.destroy,
    // который уничтожит дочерние спрайты
    // частицы уже уничтожаются в _update,
    // но на всякий случай, если destroy вызван досрочно
    for (let i = this._particles.length - 1; i >= 0; i -= 1) {
      const particle = this._particles[i];
      if (particle && !particle.destroyed) {
        this.removeChild(particle);
        particle.destroy();
      }
    }

    this._particles = []; // очистка массива ссылок

    super.destroy(options);
  }
}
