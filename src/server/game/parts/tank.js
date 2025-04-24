import BaseModel from './baseModel.js';
import { BoxShape, Vec2, Rot } from 'planck'; // Импортируем Rot для вращений

class Tank extends BaseModel {
  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    this._forwardForce = 120000; // Сила, применяемая при ускорении вперед
    this._reverseForce = 700000; // Сила, применяемая при ускорении назад/торможении
    this._turnTorque = 1000000; // Крутящий момент, применяемый для поворота
    this._maxForwardSpeed = 110; // Целевая макс. скорость вперед (м/с или юнитов/с)
    this._maxReverseSpeed = -75; // Целевая макс. скорость назад (м/с или юнитов/с)

    // Затухание (Damping) контролирует, как быстро танк замедляется естественно
    // или прекращает поворачиваться.
    // Большие значения = большее затухание (замедляется быстрее).
    this._linearDamping = 2.0; // Сопротивление линейному движению (как сопротивление воздуха/трение)
    this._angularDamping = 4.0; // Сопротивление вращению

    // Сила бокового сцепления
    // Больше значение = меньше занос/скольжение
    this._lateralGrip = 3.0;

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
      linearDamping: this._linearDamping,
      allowSleep: false,
    });

    this._body.gunRotation = 0;

    const fixture = this._body.createFixture(
      new BoxShape(this._modelData.width / 2, this._modelData.height / 2),
      {
        density: 0.3, // плотность (масса = плотность * площадь)
        friction: 0.01, // небольшое трение может ощущаться естественнее
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

    // --- НОВАЯ ЛОГИКА: Применение силы против бокового скольжения ---
    const lateralVel = this.getLateralVelocity(body);
    // Чем выше _lateralGrip, тем сильнее гасится боковая скорость
    const sidewaysForceMagnitude =
      -lateralVel * this._lateralGrip * body.getMass(); // Умножаем на массу для консистентности силы
    const sidewaysForceVec = body.getWorldVector(
      new Vec2(0, sidewaysForceMagnitude),
    ); // Сила действует перпендикулярно направлению танка
    body.applyForceToCenter(sidewaysForceVec, true);
    // -------------------------------------------------------------

    // 1. Применяем силу Вперед/Назад (логика без изменений)
    let forceMagnitude = 0;
    if (forward && currentForwardSpeed < this._maxForwardSpeed) {
      forceMagnitude = this._forwardForce;
    } else if (back) {
      if (
        currentForwardSpeed > 0 ||
        currentForwardSpeed > this._maxReverseSpeed
      ) {
        forceMagnitude = -this._reverseForce;
      }
    }
    // В updateData, ДО блока if (forceMagnitude !== 0)
    console.log(
      `DEBUG Speed Check -> Current: ${currentForwardSpeed.toFixed(2)}, Max Limit: ${this._maxForwardSpeed}`,
    );
    if (forceMagnitude !== 0) {
      const appliedForce = forwardVec.mul(forceMagnitude);
      body.applyForceToCenter(appliedForce, true);
    }

    // 2. Применяем крутящий момент для поворота (логика без изменений)
    let torque = 0;
    const baseTurnFactor = 0.5;
    const turnFactor =
      Math.abs(currentForwardSpeed) < 0.1 ? baseTurnFactor : 1.0;
    // console.log(`Current Fwd Speed: ${currentForwardSpeed.toFixed(2)}, Turn Factor: ${turnFactor.toFixed(2)}`); // Лог можно оставить или убрать
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
