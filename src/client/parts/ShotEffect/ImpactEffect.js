import { Graphics, Ticker, Container } from 'pixi.js';

// функция для линейной интерполяции
function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

// TODO доработать таймер жизни осколков

// функция для случайного числа в диапазоне
function randomRange(min, max) {
  return Math.random() * (max - min) + min;
}

export default class ImpactEffect extends Container {
  constructor(x, y, impactDirectionX, impactDirectionY, onComplete) {
    super();

    this.x = x; // координата X центра эффекта
    this.y = y; // координата Y центра эффекта
    this.onComplete = onComplete; // callback, когда все частицы исчезли

    this.config = {
      particleCount: randomRange(2, 6), // количество осколков
      particleMinSize: 1, // минимальный размер осколка
      particleMaxSize: 3, // максимальный размер осколка

      // начальная скорость разлета
      minInitialSpeed: 1, // пикселей в секунду
      maxInitialSpeed: 200, // пикселей в секунду

      // жизненный цикл осколков
      minLifetime: 600, // мс
      maxLifetime: 5200, // мс

      color: [0x777777, 0x444444], // массив цветов для осколков

      fadeOutStart: 0.7, // начинать угасание, когда прошло 70% времени жизни

      // управление направлением разлета
      impactDirectionX: impactDirectionX, // компонента X базового направления отлета
      impactDirectionY: impactDirectionY, // компонента Y
      spreadAngle: 60, // угол разброса в градусах (например, 90-градусный сектор)

      // параметры для управления движением и остановкой
      dragCoefficient: 5, // коэффициент сопротивления (чем выше, тем быстрее остановка)
      minSpeedThreshold: 1.0, // порог скорости, ниже которого частица считается "остановившейся" (пикс/сек)
      lingerDuration: 5000, // сколько времени частица лежит неподвижно перед угасанием (мс)
    };

    // обработка случая, когда impactDirection (0,0) - например, выстрел в точку
    // в этом случае частицы разлетятся во все стороны
    if (
      this.config.impactDirectionX === 0 &&
      this.config.impactDirectionY === 0
    ) {
      this.useOmnidirectionalSpread = true; // флаг для разлета во все стороны
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

    for (let i = 0, len = this.config.particleCount; i < len; i += 1) {
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
        lifetime: randomRange(this.config.minLifetime, this.config.maxLifetime),
        age: 0,
        alpha: 1.0,
        active: true,
        isMoving: true,
        timeSinceStopped: 0,
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
    gfx.circle(0, 0, halfSize);
    gfx.fill(fillStyle);
  }

  run() {
    if (this.isComplete) {
      return;
    }

    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  _update(deltaMS) {
    if (this.isComplete) {
      return;
    }

    this.elapsedTime += deltaMS;
    const deltaSeconds = deltaMS / 1000;
    let activeParticlesCount = 0;

    for (let i = 0, len = this.particlesData.length; i < len; i += 1) {
      const pData = this.particlesData[i];
      if (!pData.active) {
        continue;
      }

      activeParticlesCount += 1;
      pData.age += deltaMS;

      if (pData.isMoving) {
        // сопротивление среды (drag)
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

        pData.x += pData.vx * deltaSeconds;
        pData.y += pData.vy * deltaSeconds;

        const currentSpeed = Math.hypot(pData.vx, pData.vy);

        // если частица остановилась
        if (currentSpeed < this.config.minSpeedThreshold) {
          pData.isMoving = false;
          pData.vx = 0;
          pData.vy = 0;
        }
      } else {
        // частица остановилась
        pData.timeSinceStopped += deltaMS;
      }

      // логика угасания и завершения жизни
      let currentLifetimeProgress = pData.age / pData.lifetime;

      if (
        !pData.isMoving &&
        pData.timeSinceStopped >= this.config.lingerDuration
      ) {
        // ускоренное угасание после остановки и задержки
        const timeIntoFade =
          pData.timeSinceStopped - this.config.lingerDuration;
        // угасание за короткое время, например, 1 секунда после lingerDuration
        const quickFadeDuration = Math.min(
          500,
          pData.lifetime * (1 - this.config.fadeOutStart),
        );
        pData.alpha = lerp(
          1.0,
          0.0,
          Math.min(timeIntoFade / quickFadeDuration, 1.0),
        );
      } else if (currentLifetimeProgress >= this.config.fadeOutStart) {
        // стандартное угасание по lifetime
        const timeIntoFade =
          pData.age - pData.lifetime * this.config.fadeOutStart;
        const fadeDuration = pData.lifetime * (1 - this.config.fadeOutStart);
        pData.alpha =
          fadeDuration > 0
            ? lerp(1.0, 0.0, Math.min(timeIntoFade / fadeDuration, 1.0))
            : 0.0;
      }

      if (pData.age >= pData.lifetime || pData.alpha < 0.01) {
        pData.active = false; // Делаем частицу неактивной
        pData.alpha = 0; // Убедимся, что она полностью прозрачна
      }

      // обновление PIXI.Graphics
      const pGfx = this.particleGraphics[i];
      pGfx.position.set(pData.x, pData.y);
      pGfx.alpha = pData.alpha;
      pGfx.visible = pData.active; // скрыть неактивные частицы
    }

    if (activeParticlesCount === 0 && this.elapsedTime > 0) {
      this.isComplete = true;

      if (this._tickListener) {
        Ticker.shared.remove(this._tickListener);
        this._tickListener = null;
      }

      this.onComplete();
    }
  }

  destroy() {
    this.isComplete = true; // _update больше не сработает

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
