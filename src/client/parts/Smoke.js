import { Container, Graphics, Ticker } from 'pixi.js';

// глобальные переменные для ветра
const globalWindX = 50;
const globalWindY = 30;

const SMOKE_CONFIG = {
  // размеры и жизнь частиц
  particleBaseSize: 6, // базовый размер
  particleLifetime: { min: 1200, max: 2000 },
  particleStartSizeFactor: { 2: 1, 1: 1, 0: 0.3 }, // множитель в начале
  particleEndSizeFactor: { 2: 1.5, 1: 1.5, 0: 0.3 }, // множитель в конце

  // прозрачность
  particleStartAlpha: 0.25,
  particleEndAlpha: 0,

  particleColor: 0x333333, // цвет дыма
  particleSpawnRate: { 2: 30, 1: 40, 0: 50 }, // общая частота спавна для потоков

  // скорость относительно танка
  particleInitialVelocity: {
    away: { min: 35, max: 50 }, // скорость назад относительно танка
    side: { min: -8, max: 8 }, // скорость вбок относительно танка
  },

  windInfluence: 1.6,
  emitterMovementInfluence: 0.7,
  particleVelocityVariance: 10, // общий разброс скорости в случайном направлении

  // множитель к половине ширине для смещения потоков дыма (0=центр, 1=края)
  streamOffsetFactor: 0.3,
  // смещение точки испускания назад
  emissionPointBackwardOffsetFactor: 0,
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

    // параметры с сервера:
    // [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.emitterX = data[0];
    this.emitterY = data[1];
    this.emitterRotation = data[2];
    this.emitterVX = data[4];
    this.emitterVY = data[5];
    this.condition = data[6];
    this._size = data[7];

    // соотношение сторон танка: 4(width):3(height)
    this._width = this._size * 4;
    this._height = this._size * 3;

    // коэффициент масштаба на основе площади. Используем sqrt для менее резкого масштабирования
    // Math.max чтобы размер не был слишком маленьким для очень мелких танков
    this.particleScaleMultiplier = Math.max(
      0.5,
      Math.sqrt(this._width * this._height * 0.001),
    );

    this.particles = [];
    this.particleContainer = new Container();
    this.addChild(this.particleContainer);

    this.timeSinceLastSpawn = 0;

    this._tickListener = ticker => this._updateParticles(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
  }

  update(data) {
    this.emitterX = data[0];
    this.emitterY = data[1];
    this.emitterRotation = data[2];
    this.emitterVX = data[4];
    this.emitterVY = data[5];
    this.condition = data[6];
  }

  _updateParticles(deltaMS) {
    if (deltaMS <= 0) {
      return;
    }

    const deltaTime = deltaMS / 1000.0; // время в секундах

    // спавн новых частиц
    this.timeSinceLastSpawn += deltaMS;

    // определяем количество потоков
    let numStreams = 1;

    if (this.condition === 1) {
      numStreams = 2;
    } else if (this.condition === 0) {
      numStreams = 3;
    }

    const spawnRate = SMOKE_CONFIG.particleSpawnRate[this.condition];
    // интервал определяет, как часто происходит "пачка" спавна (для всех потоков сразу)
    const spawnInterval = 1000.0 / spawnRate;

    //let spawnedThisFrame = 0;

    // если пора спавнить, спавним частицы для каждого потока
    while (this.timeSinceLastSpawn >= spawnInterval) {
      for (let i = 0; i < numStreams; i++) {
        this.spawnParticle(i, numStreams);
      }

      this.timeSinceLastSpawn -= spawnInterval;
      //spawnedThisFrame += numStreams;
    }

    // обновление существующих частиц
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];

      particle.age += deltaMS;

      if (particle.age >= particle.lifetime) {
        this.particleContainer.removeChild(particle.graphics);
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

      const currentScale = currentSizeFactor * this.particleScaleMultiplier;

      particle.graphics.x = particle.x;
      particle.graphics.y = particle.y;
      particle.graphics.scale.set(currentScale);
      particle.graphics.alpha = currentAlpha;
    }
  }

  // расчет смещения и скорости с учетом вращения
  // создает одну частицу дыма для заданного потока с учетом вращения эмиттера
  spawnParticle(streamIndex, numStreams) {
    const lifetime = randomRange(
      SMOKE_CONFIG.particleLifetime.min,
      SMOKE_CONFIG.particleLifetime.max,
    );
    const startSizeFactor =
      SMOKE_CONFIG.particleStartSizeFactor[this.condition];
    const endSizeFactor = SMOKE_CONFIG.particleEndSizeFactor[this.condition];
    const startAlpha = SMOKE_CONFIG.particleStartAlpha;
    const endAlpha = SMOKE_CONFIG.particleEndAlpha;
    const baseSize = SMOKE_CONFIG.particleBaseSize;
    const angle = this.emitterRotation;
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);

    // расчет локального смещения точки спавна
    let localOffsetX = 0;
    const streamDisplacement =
      (this._width / 1.5) * SMOKE_CONFIG.streamOffsetFactor;

    if (numStreams === 2) {
      localOffsetX =
        streamIndex === 0 ? -streamDisplacement : streamDisplacement;
    } else if (numStreams === 3) {
      localOffsetX = (streamIndex - 1) * streamDisplacement;
    }

    // смещение назад от центра танка
    const localOffsetY =
      this._height * SMOKE_CONFIG.emissionPointBackwardOffsetFactor;

    // поворот локального смещения и расчет глобальной точки спавна
    const rotatedOffsetX = localOffsetX * cosAngle - localOffsetY * sinAngle;
    const rotatedOffsetY = localOffsetX * sinAngle + localOffsetY * cosAngle;

    const spawnX = this.emitterX + rotatedOffsetX;
    const spawnY = this.emitterY + rotatedOffsetY;

    // расчет начальной скорости с учетом вращения
    const speedAway = randomRange(
      SMOKE_CONFIG.particleInitialVelocity.away.min,
      SMOKE_CONFIG.particleInitialVelocity.away.max,
    );
    const speedSide = randomRange(
      SMOKE_CONFIG.particleInitialVelocity.side.min,
      SMOKE_CONFIG.particleInitialVelocity.side.max,
    );

    // компоненты скорости относительно танка
    const baseVX = -sinAngle * speedAway + cosAngle * speedSide;
    const baseVY = cosAngle * speedAway + sinAngle * speedSide;

    // добавляем случайный разброс
    const varianceAngle = Math.random() * Math.PI * 2;

    // используем общий разброс
    const varianceMagnitude = SMOKE_CONFIG.particleVelocityVariance;
    const varianceVX = Math.cos(varianceAngle) * varianceMagnitude;
    const varianceVY = Math.sin(varianceAngle) * varianceMagnitude;

    // итоговая начальная скорость частицы
    const initialVX =
      baseVX +
      varianceVX +
      this.emitterVX * SMOKE_CONFIG.emitterMovementInfluence;
    const initialVY =
      baseVY +
      varianceVY +
      this.emitterVY * SMOKE_CONFIG.emitterMovementInfluence;

    // создание графики и объекта частицы
    const graphics = new Graphics();
    graphics.circle(0, 0, baseSize);
    graphics.fill(SMOKE_CONFIG.particleColor);

    graphics.x = spawnX; // начальная позиция с поворотом
    graphics.y = spawnY;
    graphics.alpha = startAlpha;
    graphics.scale.set(startSizeFactor * this.particleScaleMultiplier);

    const particle = {
      graphics,
      x: spawnX,
      y: spawnY,
      vx: initialVX, // начальная скорость с поворотом
      vy: initialVY,
      age: 0,
      lifetime,
      startSizeFactor,
      endSizeFactor,
      startAlpha,
      endAlpha,
    };

    this.particleContainer.addChild(graphics);
    this.particles.push(particle);
  }

  _stopTimer() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
  }

  destroy(options) {
    this._stopTimer();

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
  }
}
