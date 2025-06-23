import { Container, Ticker, Sprite } from 'pixi.js';

export default class SmokeEffect extends Container {
  constructor(options = {}, assets) {
    super();

    this.particleTexture = assets.explosionParticle;

    this._particles = [];
    this._isStarted = false;
    this._isSpawning = true;

    // параметры дыма
    this._particleSpawnRateMS = options.spawnRate ?? 1000;
    this._particleMaxLifeMS = options.maxLife ?? 3000;
    this._particleColor = options.color ?? 0x494949;
    this._initialScale = options.initialScale ?? 0.02;
    this._maxScale = options.maxScale ?? 0.04;
    this._initialAlpha = options.initialAlpha ?? 0.25; // начальная прозрачность
    this._initialOffsetX = options.initialOffsetX ?? 3;
    this._initialOffsetY = options.initialOffsetY ?? 3;
    this._stretch = options.stretch ?? 5;

    this._lastSpawnTime = 0;
    this._tickListener = null;
  }

  run() {
    if (this._isStarted) {
      return;
    }

    this._isStarted = true;
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
  }

  stopSpawning() {
    this._isSpawning = false;
  }

  _createParticle() {
    const particle = new Sprite(this.particleTexture);

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
      stretchFactor: this._stretch * (0.8 + Math.random() * 0.4), // от 80% до 120% от базового
    };

    this.addChild(particle);
    this._particles.push(particle);
  }

  _update(deltaMS) {
    if (this._isSpawning) {
      this._lastSpawnTime += deltaMS;

      if (this._lastSpawnTime > this._particleSpawnRateMS) {
        this._createParticle();
        this._lastSpawnTime = 0;
      }
    }

    for (let i = this._particles.length - 1; i >= 0; i -= 1) {
      const particle = this._particles[i];
      particle.customData.life += deltaMS;

      if (particle.customData.life >= this._particleMaxLifeMS) {
        this.removeChild(particle);
        particle.destroy();
        this._particles.splice(i, 1);
      } else {
        const progress = particle.customData.life / this._particleMaxLifeMS;
        particle.x += particle.customData.driftX * (deltaMS / 16);
        particle.y += particle.customData.driftY * (deltaMS / 16);

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

    if (!this._isSpawning && this._particles.length === 0) {
      this.destroy();
    }
  }

  destroy(options) {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    this._isStarted = false;

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({ children: true, ...options });
    this._particles = [];
  }
}
