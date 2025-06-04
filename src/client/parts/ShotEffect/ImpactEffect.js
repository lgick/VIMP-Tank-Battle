import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

// функция для случайного числа в диапазоне
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export default class ImpactEffect extends Container {
  constructor(x, y, config = {}) {
    super();

    this.zIndex = 2;

    this.x = x; // координата X центра эффекта
    this.y = y; // координата Y центра эффекта

    this.defaultConfig = {
      particleCount: randomRange(2, 6), // количество осколков
      particleMinSize: 1, // минимальный размер осколка
      particleMaxSize: 3, // максимальный размер осколка

      // начальная скорость разлета
      minInitialSpeed: 1, // пикселей в секунду
      maxInitialSpeed: 200, // пикселей в секунду

      // жизненный цикл осколков
      minLifetime: 600, // мс
      maxLifetime: 120000, // мс

      color: [0x777777, 0x444444], // массив цветов для осколков

      fadeOutStart: 0.7, // начинать угасание, когда прошло 70% времени жизни

      // управление направлением разлета
      impactDirectionX: 0, // компонента X базового направления отлета
      impactDirectionY: 0, // компонента Y
      spreadAngle: 60, // угол разброса в градусах (например, 90-градусный сектор)

      // параметры для управления движением и остановкой
      dragCoefficient: 5, // коэффициент сопротивления (чем выше, тем быстрее остановка)
      minSpeedThreshold: 1.0, // порог скорости, ниже которого частица считается "остановившейся" (пикс/сек)
      lingerDuration: 100000, // сколько времени частица лежит неподвижно перед угасанием (мс)
    };

    this.config = { ...this.defaultConfig, ...config };

    // обработка случая, когда impactDirection (0,0) - например, выстрел в точку
    // в этом случае частицы разлетятся во все стороны
    if (
      this.config.impactDirectionX === 0 &&
      this.config.impactDirectionY === 0
    ) {
      this.useOmnidirectionalSpread = true; // Флаг для разлета во все стороны
    } else {
      this.useOmnidirectionalSpread = false;
    }

    this.particlesData = []; // хранение данные для управления логикой
    this.particleGraphics = []; // PIXI.Graphics для каждого осколка
    this.elapsedTime = 0;
    this.isComplete = false; // флаг станет true, когда все частицы исчезнут

    this._createParticles();
  }

  _createParticles() {
    let baseAngleRad;
    if (!this.useOmnidirectionalSpread) {
      baseAngleRad = Math.atan2(
        this.config.impactDirectionY,
        this.config.impactDirectionX,
      );
    }
    const spreadAngleRad = this.config.spreadAngle * (Math.PI / 180);
    const halfSpreadRad = spreadAngleRad / 2;

    for (let i = 0; i < this.config.particleCount; i += 1) {
      let particleAngle;
      if (this.useOmnidirectionalSpread) {
        particleAngle = Math.random() * Math.PI * 2;
      } else {
        particleAngle =
          baseAngleRad + randomRange(-halfSpreadRad, halfSpreadRad);
      }

      const initialSpeed = randomRange(
        this.config.minInitialSpeed,
        this.config.maxInitialSpeed,
      );

      const particleData = {
        x: 0,
        y: 0,
        vx: Math.cos(particleAngle) * initialSpeed,
        vy: Math.sin(particleAngle) * initialSpeed,
        size: randomRange(
          this.config.particleMinSize,
          this.config.particleMaxSize,
        ),
        color: Array.isArray(this.config.color)
          ? this.config.color[
              Math.floor(Math.random() * this.config.color.length)
            ]
          : this.config.color,

        // Общее время жизни частицы
        lifetime: randomRange(this.config.minLifetime, this.config.maxLifetime),
        age: 0,
        alpha: 1.0,
        active: true,
        isMoving: true, // Флаг, что частица еще движется
        timeSinceStopped: 0, // Время, прошедшее с момента остановки
      };

      this.particlesData.push(particleData);

      const gfx = new Graphics();
      this._drawParticleShape(gfx, particleData);
      this.addChild(gfx);
      this.particleGraphics.push(gfx);
    }
  }

  _drawParticleShape(gfx, particleData) {
    gfx.clear();
    const halfSize = particleData.size / 2;
    let fillStyle = { color: particleData.color, alpha: particleData.alpha };
    let lineStyle = null;

    gfx.circle(0, 0, halfSize); // круг

    gfx.fill(fillStyle);
    if (lineStyle) {
      gfx.stroke(lineStyle);
    }
  }

  run() {
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  _update(deltaMS) {
    if (this.isComplete) return;

    this.elapsedTime += deltaMS;
    const deltaSeconds = deltaMS / 1000;
    let activeParticlesCount = 0;

    for (let i = 0, len = this.particlesData.length; i < len; i += 1) {
      const pData = this.particlesData[i];
      if (!pData.active) continue;

      activeParticlesCount++;
      pData.age += deltaMS;

      if (pData.isMoving) {
        // Применяем сопротивление среды (drag)
        const speed = Math.hypot(pData.vx, pData.vy);
        if (speed > 0) {
          const dragForceMagnitude =
            speed * this.config.dragCoefficient * deltaSeconds;

          const speedReductionFactor = Math.max(
            0,
            1 - dragForceMagnitude / speed,
          );
          pData.vx *= speedReductionFactor;
          pData.vy *= speedReductionFactor;
        }

        // Обновляем позицию
        pData.x += pData.vx * deltaSeconds;
        pData.y += pData.vy * deltaSeconds;

        // Проверяем, остановилась ли частица
        const currentSpeed = Math.hypot(pData.vx, pData.vy);
        if (currentSpeed < this.config.minSpeedThreshold) {
          pData.isMoving = false;
          pData.vx = 0;
          pData.vy = 0;
        }
      } else {
        // Частица остановилась
        pData.timeSinceStopped += deltaMS;
      }

      // Логика угасания и завершения жизни
      let currentLifetimeProgress = pData.age / pData.lifetime;

      if (
        !pData.isMoving &&
        pData.timeSinceStopped >= this.config.lingerDuration
      ) {
        if (currentLifetimeProgress >= this.config.fadeOutStart) {
          const timeIntoFade =
            pData.age - pData.lifetime * this.config.fadeOutStart;
          const fadeDuration = pData.lifetime * (1 - this.config.fadeOutStart);
          pData.alpha =
            fadeDuration > 0
              ? lerp(1.0, 0.0, Math.min(timeIntoFade / fadeDuration, 1.0))
              : 0.0;
        } else if (pData.age >= pData.lifetime) {
          pData.alpha = 0;
        }
      } else if (
        pData.isMoving &&
        currentLifetimeProgress >= this.config.fadeOutStart
      ) {
        const timeIntoFade =
          pData.age - pData.lifetime * this.config.fadeOutStart;
        const fadeDuration = pData.lifetime * (1 - this.config.fadeOutStart);
        pData.alpha =
          fadeDuration > 0
            ? lerp(1.0, 0.0, Math.min(timeIntoFade / fadeDuration, 1.0))
            : 0.0;
      }

      // Обновление PIXI.Graphics
      const pGfx = this.particleGraphics[i];
      pGfx.position.set(pData.x, pData.y);
      pGfx.alpha = pData.alpha;

      if (pData.age >= pData.lifetime || pData.alpha < 0.01) {
        pData.active = false;
        pGfx.visible = false;
      }
    }

    if (activeParticlesCount === 0 && this.elapsedTime > 0) {
      this.isComplete = true;
      this.destroy();
    }
  }

  destroy() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
    if (this.parent) {
      this.parent.removeChild(this);
    }
    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
