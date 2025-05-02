import { Container, Graphics, Ticker } from 'pixi.js';

let globalWindX = 50;
let globalWindY = 30;

const SMOKE_CONFIG = {
  particleBaseSize: 8,
  particleLifetime: { min: 1200, max: 2000 },
  particleStartSizeFactor: 1.0,
  particleEndSizeFactor: 1.0,

  particleStartAlpha: 0.25,
  particleEndAlpha: 0,

  particleColor: 0x333333,
  particleSpawnRate: { 2: 30, 1: 50 },
  particleInitialVelocity: {
    x: { min: -5, max: 5 },
    y: { min: -45, max: -45 },
  },
  windInfluence: 1.6,
  emitterMovementInfluence: 0.7,
  particleVelocityVarianceX: 5,
  particleVelocityVarianceY: 5,
};

function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export default class Smoke extends Container {
  constructor(data) {
    super();

    this.zIndex = 4;

    // параметры с сервера: [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.emitterX = data[0];
    this.emitterY = data[1];
    this.emitterVX = data[4];
    this.emitterVY = data[5];
    this.condition = data[6];

    this.particles = [];
    this.particleContainer = new Container();
    this.addChild(this.particleContainer);

    this.timeSinceLastSpawn = 0;
    this.isActive = true;

    // !!! ВОЗВРАЩАЕМ ТИКЕР !!!
    // Этот метод будет вызываться тикером КАЖДЫЙ кадр
    // Стрелочная функция сохраняет контекст `this`
    this.tickListener = ticker => this._updateParticles(ticker.deltaMS);
    Ticker.shared.add(this.tickListener);
  }

  /**
   * Публичный метод для обновления ТОЛЬКО данных источника (танка).
   * НЕ вызывается тикером, вызывается ИЗ игрового цикла.
   * @param {Array<number>} emitterData - Массив [x, y, vx, vy] с текущими данными источника (танка).
   */
  update(emitterData) {
    // Просто обновляем позицию и скорость источника
    this.emitterX = emitterData[0];
    this.emitterY = emitterData[1];
    this.emitterVX = emitterData[2];
    this.emitterVY = emitterData[3];

    // Можно добавить лог для проверки, что метод вызывается
    // console.log(`Smoke emitter updated to: [${this.emitterX.toFixed(1)}, ${this.emitterY.toFixed(1)}]`);
  }

  /**
   * Внутренний метод, ВЫЗЫВАЕМЫЙ ТИКЕРОМ PixiJS.
   * Обрабатывает логику спавна и обновления частиц.
   * @param {number} deltaMS - Время в миллисекундах, переданное тикером.
   * @private
   */
  _updateParticles(deltaMS) {
    if (!this.isActive || deltaMS <= 0) return;

    const deltaTime = deltaMS / 1000.0; // Время в секундах

    // --- 1. Спавн новых частиц ---
    this.timeSinceLastSpawn += deltaMS;
    const spawnRate = SMOKE_CONFIG.particleSpawnRate[this.condition];
    const spawnInterval = 1000.0 / spawnRate;

    let spawnedThisFrame = 0;
    while (this.timeSinceLastSpawn >= spawnInterval) {
      this.spawnParticle();
      this.timeSinceLastSpawn -= spawnInterval;
      spawnedThisFrame++;
    }
    // if (spawnedThisFrame > 0) {
    //     console.log(`---> Spawned ${spawnedThisFrame} particles. Total particles: ${this.particles.length}`);
    // }

    // --- 2. Обновление существующих частиц ---
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const particle = this.particles[i];
      particle.age += deltaMS;

      if (particle.age >= particle.lifetime) {
        this.particleContainer.removeChild(particle.graphics);
        // particle.graphics.destroy({ children: true, texture: false, baseTexture: false }); // Опционально
        this.particles.splice(i, 1);
        continue;
      }

      const lifeProgress = particle.age / particle.lifetime;

      particle.vx += globalWindX * SMOKE_CONFIG.windInfluence * deltaTime;
      particle.vy += globalWindY * SMOKE_CONFIG.windInfluence * deltaTime;

      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;

      const currentSizeFactor = lerp(
        particle.startSizeFactor,
        particle.endSizeFactor,
        lifeProgress,
      );
      const currentAlpha = lerp(
        particle.startAlpha,
        particle.endAlpha,
        lifeProgress,
      );
      const currentScale = currentSizeFactor;

      particle.graphics.x = particle.x;
      particle.graphics.y = particle.y;
      particle.graphics.scale.set(currentScale);
      particle.graphics.alpha = currentAlpha;
    }
  }

  // --- Метод spawnParticle остается без изменений ---
  spawnParticle() {
    const lifetime = randomRange(
      SMOKE_CONFIG.particleLifetime.min,
      SMOKE_CONFIG.particleLifetime.max,
    );
    const startSizeFactor = SMOKE_CONFIG.particleStartSizeFactor;
    const endSizeFactor = SMOKE_CONFIG.particleEndSizeFactor;
    const startAlpha = SMOKE_CONFIG.particleStartAlpha;
    const endAlpha = SMOKE_CONFIG.particleEndAlpha;
    const baseSize = SMOKE_CONFIG.particleBaseSize;

    const initialVX =
      randomRange(
        SMOKE_CONFIG.particleInitialVelocity.x.min,
        SMOKE_CONFIG.particleInitialVelocity.x.max,
      ) +
      this.emitterVX * SMOKE_CONFIG.emitterMovementInfluence +
      randomRange(
        -SMOKE_CONFIG.particleVelocityVarianceX,
        SMOKE_CONFIG.particleVelocityVarianceX,
      );
    const initialVY =
      randomRange(
        SMOKE_CONFIG.particleInitialVelocity.y.min,
        SMOKE_CONFIG.particleInitialVelocity.y.max,
      ) +
      this.emitterVY * SMOKE_CONFIG.emitterMovementInfluence +
      randomRange(
        -SMOKE_CONFIG.particleVelocityVarianceY,
        SMOKE_CONFIG.particleVelocityVarianceY,
      );

    const graphics = new Graphics();
    graphics.circle(0, 0, baseSize);
    graphics.fill(SMOKE_CONFIG.particleColor);

    graphics.x = this.emitterX;
    graphics.y = this.emitterY;
    graphics.alpha = startAlpha;
    graphics.scale.set(startSizeFactor);

    const particle = {
      graphics: graphics,
      x: this.emitterX,
      y: this.emitterY,
      vx: initialVX,
      vy: initialVY,
      age: 0,
      lifetime: lifetime,
      startSizeFactor: startSizeFactor,
      endSizeFactor: endSizeFactor,
      startAlpha: startAlpha,
      endAlpha: endAlpha,
    };

    this.particleContainer.addChild(graphics);
    this.particles.push(particle);
  }

  setCondition(condition) {
    this.condition = condition;
  }

  stop() {
    this.isActive = false;
  }

  start() {
    this.isActive = true;
    this.timeSinceLastSpawn = 0;
  }

  // --- В destroy возвращаем удаление из тикера ---
  destroy(options) {
    this.isActive = false;
    // !!! Удаляем слушателя из тикера !!!
    Ticker.shared.remove(this.tickListener);

    this.particleContainer.destroy({
      children: true,
      texture: false,
      baseTexture: false,
    });
    this.particles = [];

    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });
    console.log('Smoke effect destroyed');
  }
}
