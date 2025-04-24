import BaseModel from './baseModel.js';
import { BoxShape, Vec2, Rot } from 'planck'; // Импортируем Rot для вращений

class Tank extends BaseModel {
  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    this._turnTorque = 1000000; // Крутящий момент, применяемый для поворота
    this._maxForwardSpeed = 118; // Целевая макс. скорость вперед (м/с или юнитов/с)
    this._maxReverseSpeed = -75; // Целевая макс. скорость назад (м/с или юнитов/с)

    // Как сильно танк "стремится" к целевой скорости (больше = резче)
    this._velocityCorrectionFactor = 30.0; // НАСТРАИВАЕМЫЙ ПАРАМЕТР! Начните с 10-20

    // Затухание (Damping) контролирует, как быстро танк замедляется естественно
    // или прекращает поворачиваться.
    this._linearDamping = 1.5; // Оставляем небольшое затухание для плавности
    this._angularDamping = 4.0; // Сопротивление вращению

    // Сила бокового сцепления
    // Больше значение = меньше занос/скольжение
    this._lateralGrip = 5.0; // Немного увеличил для компенсации возможного заноса при резком ускорении

    // параметры орудия
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
      angularDamping: this._angularDamping,
      linearDamping: this._linearDamping, // Используем обновленное значение
      allowSleep: false,
    });

    this._body.gunRotation = 0;

    const fixture = this._body.createFixture(
      new BoxShape(this._modelData.width / 2, this._modelData.height / 2),
      {
        density: 0.3, // плотность (масса = плотность * площадь)
        friction: 0.01, // Оставляем низким
        restitution: 0.0, // без упругости (отскока)
      },
    );

    this._centeringGun = false;
    this._gunCenterSpeed = 5.0;
  }

  // линейная интерполяция между x и y, коэффициент a ∈ [0,1]
  lerp(x, y, a) {
    return x * (1 - a) + y * a;
  }

  // получение боковой скорости
  getLateralVelocity(body) {
    const currentRightNormal = body.getWorldVector(new Vec2(0, 1)); // Вектор вправо отн. танка
    return Vec2.dot(currentRightNormal, body.getLinearVelocity()); // Проекция скорости на правый вектор
  }

  updateData(dt) {
    const forward = Boolean(this.currentKeys & this.keysData.forward);
    const back = Boolean(this.currentKeys & this.keysData.back);
    const left = Boolean(this.currentKeys & this.keysData.left);
    const right = Boolean(this.currentKeys & this.keysData.right);

    const body = this._body;
    const currentVelocity = body.getLinearVelocity();
    const forwardVec = body.getWorldVector(new Vec2(1, 0));
    const currentForwardSpeed = Vec2.dot(currentVelocity, forwardVec);

    // --- Применение силы против бокового скольжения (ОСТАВЛЯЕМ!) ---
    const lateralVel = this.getLateralVelocity(body);
    const sidewaysForceMagnitude =
      -lateralVel * this._lateralGrip * body.getMass();
    const sidewaysForceVec = body.getWorldVector(
      new Vec2(0, sidewaysForceMagnitude),
    );
    body.applyForceToCenter(sidewaysForceVec, true);
    // -------------------------------------------------------------

    // 1. --- ГИБРИДНОЕ УПРАВЛЕНИЕ СКОРОСТЬЮ ---
    let targetSpeed = 0;
    // Определяем целевую скорость на основе ввода
    if (forward) {
      targetSpeed = this._maxForwardSpeed;
    } else if (back) {
      targetSpeed = this._maxReverseSpeed;
    }
    // Если ни вперед ни назад, targetSpeed = 0, сила будет тормозить танк к остановке

    const targetVelocity = forwardVec.mul(targetSpeed); // Желаемый вектор скорости
    const velocityDifference = targetVelocity.sub(currentVelocity); // Разница между желаемой и текущей

    // Применяем силу, чтобы скорректировать скорость к целевой
    // Не умножаем на dt, так как applyForce работает по времени
    const correctionForce = velocityDifference.mul(
      this._velocityCorrectionFactor * body.getMass(),
    );
    body.applyForceToCenter(correctionForce, true);
    // -----------------------------------------

    // Убираем лог, так как он больше не нужен для отладки этого конкретного случая
    // console.log(`DEBUG Speed Check -> Current: ${currentForwardSpeed.toFixed(2)}, Max Limit: ${this._maxForwardSpeed}`);

    // 2. Применяем крутящий момент для поворота (логика без изменений)
    let torque = 0;
    const baseTurnFactor = 0.5;
    const turnFactor =
      Math.abs(currentForwardSpeed) < 0.1 ? baseTurnFactor : 1.0;
    const turnDirection = currentForwardSpeed < -0.1 ? -1 : 1;
    if (left) {
      torque = -this._turnTorque * turnFactor * turnDirection;
    }
    if (right) {
      torque = this._turnTorque * turnFactor * turnDirection;
    }
    if (torque !== 0) {
      body.applyTorque(torque, true);
    }

    // --- Остальной код (орудие, пули, getData и т.д.) без изменений ---
    // ... (весь код ниже остается прежним) ...
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
        const muzzleVelocity = 100;
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
