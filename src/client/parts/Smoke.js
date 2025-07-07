import { Container, Ticker, Sprite } from 'pixi.js';

// глобальные переменные для ветра
const globalWindX = 50;
const globalWindY = 30;

const SMOKE_CONFIG = {
  // размеры и жизнь частиц
  particleLifetime: { min: 1200, max: 2000 },
  particleStartSizeFactor: { 2: 1, 1: 1, 0: 0.3 }, // множитель в начале
  particleEndSizeFactor: { 2: 1.5, 1: 1.5, 0: 0.3 }, // множитель в конце

  // прозрачность
  particleStartAlpha: 0.25,
  particleEndAlpha: 0,

  // цвет дыма
  particleColor: 0x333333,
  // общая частота спавна для потоков
  particleSpawnRate: { 2: 30, 1: 40, 0: 50 },

  // скорость относительно танка
  particleInitialVelocity: {
    away: { min: 35, max: 50 }, // скорость назад относительно танка
    side: { min: -8, max: 8 }, // скорость вбок относительно танка
  },

  windInfluence: 1.6,
  emitterMovementInfluence: 0.7,
  // общий разброс скорости в случайном направлении
  particleVelocityVariance: 10,

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
  constructor(data, assets) {
    super();

    this.zIndex = 4;

    // ассет для частиц дыма
    this.smokeTexture = assets.smokeTexture;

    // параметры с сервера:
    // [x, y, rotation, gunRotation, vX, vY, condition, size, teamId]
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

    // коэффициент масштаба на основе площади.
    // Используем sqrt для менее резкого масштабирования
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

  _updateParticles(deltaMs) {
    if (deltaMs <= 0) {
      return;
    }

    const deltaTime = deltaMs / 1000.0; // время в секундах

    // спавн новых частиц
    this.timeSinceLastSpawn += deltaMs;

    // определяем количество потоков
    let numStreams = 1;

    if (this.condition === 1) {
      numStreams = 2;
    } else if (this.condition === 0) {
      numStreams = 3;
    }

    const spawnRate = SMOKE_CONFIG.particleSpawnRate[this.condition];
    // интервал определяет, как часто происходит "пачка" спавна
    // (для всех потоков сразу)
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

      particle.age += deltaMs;

      if (particle.age >= particle.lifetime) {
        this.particleContainer.removeChild(particle.graphics);
        particle.graphics.destroy();
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
    const graphics = new Sprite(this.smokeTexture);
    graphics.anchor.set(0.5);
    graphics.tint = SMOKE_CONFIG.particleColor;

    graphics.x = spawnX; // начальная позиция с поворотом
    graphics.y = spawnY;
    graphics.alpha = startAlpha;

    // начальный масштаб будет startSizeFactor * this.particleScaleMultiplier
    const initialScale = startSizeFactor * this.particleScaleMultiplier;
    graphics.scale.set(initialScale);

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

    // уничтожаем частицы, если они еще остались
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      this.particleContainer.removeChild(this.particles[i].graphics);
      this.particles[i].graphics.destroy();
    }

    this.particles = [];

    this.particleContainer.destroy({
      children: true,
      texture: false, // текстуры общие
      baseTexture: false,
    });

    super.destroy({
      children: true, // уничтожит particleContainer, если он еще не уничтожен
      texture: false,
      baseTexture: false,
      ...options,
    });
  }
}
