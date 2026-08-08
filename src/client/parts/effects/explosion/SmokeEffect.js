import ParticlePool from '../../ParticlePool.js';
import BaseEffect from '../BaseEffect.js';

// радиус взрыва, под который подобраны размеры дыма (бомба w2):
// та же эталонная бомба стоит за FUNNEL_TO_BLAST_RATIO в FunnelEffect
// (там она записана как доля радиуса)
// у оружия с другим радиусом геометрия султана масштабируется пропорционально,
// а времена жизни и прозрачность остаются - они задают характер, не габарит
export const REFERENCE_BLAST_RADIUS = 50;

export default class SmokeEffect extends BaseEffect {
  constructor(assets, radius = REFERENCE_BLAST_RADIUS) {
    super();

    const blastScale = radius / REFERENCE_BLAST_RADIUS;

    this._blastScale = blastScale;

    const { texture, contentSize } = assets.explosionTexture;

    this.explosionTexture = texture;

    // размеры частиц задаются в юнитах мира,
    // масштаб нормируется по нарисованному кругу (не по холсту с размытием)
    this._unitScale = 1 / contentSize;

    this._particles = [];
    this._isSpawning = true;

    this._particleSpawnRateMs = 50;
    this._particleMaxLifeMs = 2000;

    // Размеры (в юнитах мира)
    this._minStartSize = 2.1 * blastScale;
    this._maxStartSize = 5.2 * blastScale;
    this._minTargetSize = 8.3 * blastScale;
    this._maxTargetSize = 16.6 * blastScale;

    this._startAlpha = 0.1;
    this._initialOffsetX = 15 * blastScale;
    this._initialOffsetY = 15 * blastScale;

    this._lastSpawnTime = 0;

    // стартовый залп
    for (let i = 0; i < 30; i += 1) {
      this._createParticle();
    }
  }

  stopSpawning() {
    this._isSpawning = false;
  }

  _createParticle() {
    // получение из пула вместо new Sprite
    const particle = ParticlePool.get(this.explosionTexture);

    particle.anchor.set(0.5);

    // вариация цвета
    const grayLevel = 0.2 + Math.random() * 0.4;
    const colorVal = Math.floor(grayLevel * 255);

    particle.tint = (colorVal << 16) | (colorVal << 8) | colorVal;

    // размер
    const startScale =
      (this._minStartSize +
        Math.random() * (this._maxStartSize - this._minStartSize)) *
      this._unitScale;

    // искажение пропорций
    const aspectX = 0.6 + Math.random() * 0.8;
    const aspectY = 0.6 + Math.random() * 0.8;

    particle.scale.set(startScale * aspectX, startScale * aspectY);

    particle.alpha = this._startAlpha + Math.random() * 0.1;
    particle.rotation = Math.random() * Math.PI * 2;

    // начальная позиция
    particle.x = (Math.random() - 0.5) * this._initialOffsetX;
    particle.y = (Math.random() - 0.5) * this._initialOffsetY;

    particle.customData = {
      life: 0,
      maxLife: this._particleMaxLifeMs * (0.7 + Math.random() * 0.6),
      aspectRatioX: aspectX,
      aspectRatioY: aspectY,

      // движение (скорости - тоже геометрия: иначе крупный султан
      // поднимался бы непропорционально медленно)
      vx: (Math.random() - 0.5) * 0.2 * this._blastScale,
      vy: (-0.3 - Math.random() * 0.4) * this._blastScale,

      // рыскание (Sway): амплитуда - смещение, частота - характер
      swaySpeed: 0.002 + Math.random() * 0.003,
      swayAmp: (0.025 + Math.random() * 0.05) * this._blastScale,
      swayOffset: Math.random() * 100,
      rotationSpeed: (Math.random() - 0.5) * 0.05,
      targetScale:
        (this._minTargetSize +
          Math.random() * (this._maxTargetSize - this._minTargetSize)) *
        this._unitScale,
      startScale,
    };

    this.addChild(particle);
    this._particles.push(particle);
  }

  _update(deltaMs) {
    if (this.isComplete) {
      return;
    }

    // ограничение в 100мс,
    // чтобы предотвратит спавн тысячи частиц
    deltaMs = Math.min(deltaMs, 100);

    if (this._isSpawning) {
      this._lastSpawnTime += deltaMs;

      while (this._lastSpawnTime > this._particleSpawnRateMs) {
        this._createParticle();
        this._lastSpawnTime -= this._particleSpawnRateMs;
      }
    }

    for (let i = this._particles.length - 1; i >= 0; i -= 1) {
      const particle = this._particles[i];
      const data = particle.customData;

      data.life += deltaMs;

      if (data.life >= data.maxLife) {
        // возвращение в пул
        ParticlePool.release(particle);
        this._particles.splice(i, 1);
      } else {
        const progress = data.life / data.maxLife;

        // физика
        data.vy *= 0.98;
        data.vx *= 0.95;

        const sway =
          Math.sin(data.life * data.swaySpeed + data.swayOffset) * data.swayAmp;

        particle.x += (data.vx + sway) * (deltaMs / 16);
        particle.y += data.vy * (deltaMs / 16);
        particle.rotation += data.rotationSpeed * (deltaMs / 16);

        // масштаб
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentBaseScale =
          data.startScale + (data.targetScale - data.startScale) * ease;

        particle.scale.set(
          currentBaseScale * data.aspectRatioX,
          currentBaseScale * data.aspectRatioY,
        );

        // альфа
        if (progress < 0.1) {
          particle.alpha = (progress / 0.1) * this._startAlpha;
        } else if (progress > 0.4) {
          const fadeP = (progress - 0.4) / 0.6;
          particle.alpha = this._startAlpha * (1 - fadeP);
        } else {
          particle.alpha = this._startAlpha;
        }
      }
    }

    if (!this._isSpawning && this._particles.length === 0 && this._isStarted) {
      this._completeEffect();

      // destroy, если эффект завершен, чтобы отписаться от тикера
      if (!this.destroyed) {
        this.destroy();
      }
    }
  }

  destroy(options) {
    // при уничтожении эффекта возвращение живых частиц в пул
    for (let i = 0; i < this._particles.length; i += 1) {
      ParticlePool.release(this._particles[i]);
    }

    this._particles = [];

    // super.destroy вызовет destroyChildren.
    // так как выполненен ParticlePool.release, там внутри removeChild;
    // children у контейнера уже пуст (или почти пуст),
    // и Pixi не будет пытаться удалить спрайты повторно
    super.destroy(options);
  }
}
