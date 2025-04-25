// --- START OF FILE tank.js ---

import BaseModel from './baseModel.js';
import { BoxShape, Vec2, Rot } from 'planck'; // Импортируем Rot для вращений

class Tank extends BaseModel {
  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    // --- Параметры Кинематического Движения ---
    this._speed = 0; // Текущая *расчетная* скорость (не из физики)
    this._maxSpeed = 240; // Желаемая максимальная скорость вперед (ед/с)
    this._maxReverseSpeed = -100; // Желаемая максимальная скорость назад (ед/с)
    this._accel = 1000; // Ускорение при газе (ед/с²) - Увеличено
    this._brakeDecel = 1500; // Торможение/"газ назад" (ед/с²) - Увеличено
    this._coastDecel = 800; // Естественное замедление (ед/с²) - Увеличено

    // --- Параметры Физического Поворота ---
    this._turnTorque = 1000000; // Крутящий момент для поворота
    this._angularDamping = 5.0; // Сопротивление вращению (можно подстроить)

    // --- Параметры орудия ---
    this._maxGunAngle = 1.4;
    this._gunAngleStep = 0.05;
    this._lastGunRotationTime = 0;
    this._gunRotationInterval = 10;

    this._bulletData = null;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: new Vec2(
        this._modelData.position[0],
        this._modelData.position[1],
      ),
      angle: this._modelData.angle * (Math.PI / 180),
      angularDamping: this._angularDamping, // Оставляем для поворотов
      linearDamping: 0.0, // ОБНУЛЯЕМ! Линейное затухание мешает setLinearVelocity
      allowSleep: false,
    });

    this._body.gunRotation = 0;

    const fixture = this._body.createFixture(
      new BoxShape(this._modelData.width / 2, this._modelData.height / 2),
      {
        density: 0.3, // Плотность все еще влияет на столкновения и немного на повороты
        friction: 0.01,
        restitution: 0.0,
      },
    );

    this._centeringGun = false;
    this._gunCenterSpeed = 5.0;
  }

  // линейная интерполяция между x и y, коэффициент a ∈ [0,1]
  lerp(x, y, a) {
    return x * (1 - a) + y * a;
  }

  // получение боковой скорости - больше не нужно для основной логики
  // getLateralVelocity(body) { ... }

  updateData(dt) {
    const forward = Boolean(this.currentKeys & this.keysData.forward);
    const back = Boolean(this.currentKeys & this.keysData.back);
    const left = Boolean(this.currentKeys & this.keysData.left);
    const right = Boolean(this.currentKeys & this.keysData.right);

    const body = this._body;

    // 1. --- КИНЕМАТИЧЕСКИЙ РАСЧЕТ СКОРОСТИ ---
    // Ускорение / Торможение / Замедление
    if (forward) {
      this._speed += this._accel * dt;
    } else if (back) {
      // Используем _brakeDecel и для торможения при движении вперед, и для ускорения назад
      this._speed -= this._brakeDecel * dt;
    } else {
      // Естественное замедление (coasting)
      if (this._speed > 0.1) {
        // Небольшой порог для избежания дрожания около нуля
        this._speed = Math.max(0, this._speed - this._coastDecel * dt);
      } else if (this._speed < -0.1) {
        this._speed = Math.min(0, this._speed + this._coastDecel * dt);
      } else {
        this._speed = 0; // Остановка если скорость очень мала
      }
    }

    // Ограничение скорости
    this._speed = Math.max(
      this._maxReverseSpeed,
      Math.min(this._maxSpeed, this._speed),
    );

    // Применение рассчитанной скорости к телу
    const angle = body.getAngle();
    const vx = Math.cos(angle) * this._speed;
    const vy = Math.sin(angle) * this._speed;
    body.setLinearVelocity(new Vec2(vx, vy)); // <-- Прямое задание скорости!
    // -----------------------------------------
    //
    //
    //

    // 2. --- ФИЗИЧЕСКОЕ УПРАВЛЕНИЕ ПОВОРОТОМ ---
    let torque = 0;
    const currentForwardSpeed = this._speed; // Используем нашу расчетную скорость для turnFactor
    const baseTurnFactor = 0.5; // Можно оставить или сделать 1.0 для поворота на месте
    const turnFactor =
      Math.abs(currentForwardSpeed) < 0.1 ? baseTurnFactor : 1.0;
    const turnDirection = currentForwardSpeed < -0.1 ? -1 : 1; // Инверсия руля при движении назад

    console.log(
      `DEBUG Speed Check -> Current: ${currentForwardSpeed.toFixed(2)}, Max Limit: ${this._maxSpeed}`,
    );

    if (left) {
      torque = -this._turnTorque * turnFactor * turnDirection;
    }
    if (right) {
      torque = this._turnTorque * turnFactor * turnDirection;
    }
    if (torque !== 0) {
      body.applyTorque(torque, true); // Применяем крутящий момент
    }
    // -----------------------------------------

    // --- Логика Орудия (без изменений) ---
    // ... (код поворота башни, стрельбы и т.д. остается здесь) ...
    if (this.currentKeys & this.keysData.gCenter) {
      this._centeringGun = true;
    }
    if (this._centeringGun) {
      this._body.gunRotation = this.lerp(
        this._body.gunRotation,
        0,
        Math.min(1, this._gunCenterSpeed * dt),
      );
      if (Math.abs(this._body.gunRotation) < 0.01) {
        this._body.gunRotation = 0;
        this._centeringGun = false;
      }
    }
    const now = Date.now();
    if (this.currentKeys & this.keysData.gLeft) {
      if (
        now - this._lastGunRotationTime > this._gunRotationInterval &&
        this._body.gunRotation > -this._maxGunAngle
      ) {
        this._body.gunRotation -= this._gunAngleStep;
        this._lastGunRotationTime = now;
        this._centeringGun = false;
      }
    }
    if (this.currentKeys & this.keysData.gRight) {
      if (
        now - this._lastGunRotationTime > this._gunRotationInterval &&
        this._body.gunRotation < this._maxGunAngle
      ) {
        this._body.gunRotation += this._gunAngleStep;
        this._lastGunRotationTime = now;
        this._centeringGun = false;
      }
    }
    if (this.currentKeys & this.keysData.fire) {
      if (this.bulletConstructorName === 'bomb') {
        const extraOffset = 20;
        const localBombOffset = new Vec2(
          -this._modelData.width / 2 - extraOffset,
          0,
        );
        this._bulletData = {
          position: this._body.getWorldPoint(localBombOffset),
          angle: this._body.getAngle(),
        };
      } else if (this.bulletConstructorName === 'bullet') {
        const totalAngle = this._body.getAngle() + this._body.gunRotation;
        const bulletOffsetDistance = this._modelData.width / 2 + 10;
        const relPos = Rot.mulVec2(
          new Rot(totalAngle),
          new Vec2(bulletOffsetDistance, 0),
        );
        const spawnPos = Vec2.add(this._body.getPosition(), relPos);
        const bulletDirection = Rot.mulVec2(
          new Rot(totalAngle),
          new Vec2(1, 0),
        );
        const muzzleVelocity = 100; // Можно увеличить для более быстрых пуль
        const gunTipVelocity =
          this._body.getLinearVelocityFromWorldPoint(spawnPos);
        const finalBulletVelocity = Vec2.add(
          gunTipVelocity,
          bulletDirection.mul(muzzleVelocity),
        );
        this._bulletData = {
          position: spawnPos,
          angle: totalAngle,
          velocity: finalBulletVelocity,
        };
      }
    }
    if (this.currentKeys & this.keysData.nextBullet) {
      this.turnUserBullet();
    }
    if (this.currentKeys & this.keysData.prevBullet) {
      this.turnUserBullet(true);
    }
    this.currentKeys = null;
  }

  // --- Остальные методы (getBody, getData и т.д.) без изменений ---
  getBody() {
    return this._body;
  }
  getData() {
    if (this.fullUserData === true) {
      this.fullUserData = false;
      return this.getFullData();
    }
    const pos = this._body.getPosition();
    const angle = this._body.getAngle();
    return [pos.x, pos.y, angle, this._body.gunRotation];
  }
  getFullData() {
    const pos = this._body.getPosition();
    const angle = this._body.getAngle();
    return [
      pos.x,
      pos.y,
      angle,
      this._body.gunRotation,
      this.teamID,
      this.name,
      this._modelData.width,
      this._modelData.height,
    ];
  }
  getBulletData() {
    const bulletData = this._bulletData;
    this._bulletData = null;
    return bulletData;
  }
}

export default Tank;
