import BaseModel from './baseModel.js';
import { BoxShape, Vec2, Rot } from 'planck';

class Tank extends BaseModel {
  // максимальный шаг в 1/30 секунды
  _MAX_DT = 1 / 30;

  // порог скорости для фактора поворота
  _TURN_SPEED_THRESHOLD = 20;

  // фактор поворота при низкой скорости
  _BASE_TURN_FACTOR_RATIO = 0.5;

  // множитель эффективности поворота при движении назад
  // (меньше 1 = менее резкий поворот назад)
  // например, 0.5 - 0.8
  _REVERSE_TURN_MULTIPLIER = 0.7;

  constructor(data) {
    super(data);

    this._modelData = data.modelData;
    this._width = this._modelData.size * 4;
    this._height = this._modelData.size * 3;

    this._baseForwardForceFactor = 700; // коэффициент тяги (вперед)
    this._baseReverseForceFactor = 500; // коэффициент тяги (назад)
    this._baseTurnTorqueFactor = 10; // коэффициент желаемой интенсивности поворота (зависит от инерции)
    this._maxForwardSpeed = 240; // целевая макс. скорость вперед (м/с или юнитов/с)
    this._maxReverseSpeed = -200; // целевая макс. скорость назад (м/с или юнитов/с)

    // затухание (Damping) контролирует, как быстро танк замедляется естественно
    // или прекращает поворачиваться.
    // большие значения = большее затухание (замедляется быстрее).
    this._linearDamping = 2.0; // сопротивление при движении (как сопротивление воздуха/трение)
    this._angularDamping = 2.0; // сопротивление при повороте

    // сила бокового сцепления
    // больше значение = меньше занос/скольжение
    this._lateralGrip = 2.0;

    // параметры орудия
    this._maxGunAngle = 1.4;
    this._gunAngleStep = 0.02;
    this._gunRotationTimer = 0; // таймер для накопления dt (в мс)
    this._gunRotationInterval = 10; // интервал в миллисекундах

    this._shotData = null;

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

    this._body.createFixture(new BoxShape(this._width / 2, this._height / 2), {
      density: 0.3, // плотность
      friction: 0.01, // трение
      restitution: 0.0, // упругость
    });

    this._mass = this._body.getMass(); // масса тела
    this._inertia = this._body.getInertia(); // сохранение момента инерции

    this._centeringGun = false;
    this._gunCenterSpeed = 5.0;

    this._condition = 2; // состояние танка
  }

  // линейная интерполяция между x и y, коэффициент a ∈ [0,1]
  lerp(x, y, a) {
    return x * (1 - a) + y * a;
  }

  // получение боковой скорости
  getLateralVelocity(body) {
    const currentRightNormal = body.getWorldVector(new Vec2(0, 1)); // вектор вправо отн. танка
    return Vec2.dot(currentRightNormal, body.getLinearVelocity()); // проекция скорости на правый вектор
  }

  updateData(dt) {
    const forward = Boolean(this.currentKeys & this.keysData.forward);
    const back = Boolean(this.currentKeys & this.keysData.back);
    const left = Boolean(this.currentKeys & this.keysData.left);
    const right = Boolean(this.currentKeys & this.keysData.right);
    const fire = Boolean(this.currentKeys & this.keysData.fire);
    const gLeft = Boolean(this.currentKeys & this.keysData.gLeft);
    const gRight = Boolean(this.currentKeys & this.keysData.gRight);
    const gCenter = Boolean(this.currentKeys & this.keysData.gCenter);
    const nextWeapon = Boolean(this.currentKeys & this.keysData.nextWeapon);
    const prevWeapon = Boolean(this.currentKeys & this.keysData.prevWeapon);

    const body = this._body;

    // ограничение максимального dt, оно может сильно скакать
    dt = Math.min(dt, this._MAX_DT);

    // накапливаем время dt для таймера башни
    this._gunRotationTimer += dt * 1000;

    // сначала обновляем поворот башни (если нажаты клавиши)
    // это гарантирует, что gunRotation актуален перед расчетом выстрела
    if (gCenter) {
      this._centeringGun = true;
    }

    // если центрируем
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

    // поворот башни
    if (gLeft) {
      if (
        this._gunRotationTimer >= this._gunRotationInterval &&
        this._body.gunRotation > -this._maxGunAngle
      ) {
        this._body.gunRotation -= this._gunAngleStep;
        this._gunRotationTimer -= this._gunRotationInterval;
        this._centeringGun = false;
      }
    }

    if (gRight) {
      if (
        this._gunRotationTimer >= this._gunRotationInterval &&
        this._body.gunRotation < this._maxGunAngle
      ) {
        this._body.gunRotation += this._gunAngleStep;
        this._gunRotationTimer -= this._gunRotationInterval;
        this._centeringGun = false;
      }
    }

    // рассчитываем параметры пули (если огонь)
    // используем состояние танка *до* применения новых сил/момента за этот кадр
    if (fire) {
      this._shotData = null; // сбрасываем на всякий случай
      const currentAngle = body.getAngle();
      const currentGunRotation = this._body.gunRotation;
      const currentPosition = body.getPosition();

      if (this.weaponConstructorName === 'bomb') {
        const extraOffset = 20;
        const localBombOffset = new Vec2(-this._width / 2 - extraOffset, 0);

        this._shotData = {
          position: body.getWorldPoint(localBombOffset), // можно использовать текущее тело
          angle: currentAngle,
        };
      } else if (this.weaponConstructorName === 'bullet') {
        const totalAngle = currentAngle + currentGunRotation;
        const bulletOffsetDistance = this._width / 2 + 10;
        const relPos = Rot.mulVec2(
          new Rot(totalAngle),
          new Vec2(bulletOffsetDistance, 0),
        );
        const spawnPos = Vec2.add(currentPosition, relPos);
        const bulletDirection = Rot.mulVec2(
          new Rot(totalAngle),
          new Vec2(1, 0),
        );
        const muzzleVelocity = 250; // скорость пули для наглядности
        // считываем скорость в точке спавна *сейчас*
        const gunTipVelocity = body.getLinearVelocityFromWorldPoint(spawnPos);
        const finalBulletVelocity = Vec2.add(
          gunTipVelocity,
          bulletDirection.mul(muzzleVelocity),
        );

        this._shotData = {
          position: spawnPos,
          angle: totalAngle,
          velocity: finalBulletVelocity,
        };
      }
    }

    // применение сил и момента
    const currentVelocity = body.getLinearVelocity();
    const forwardVec = body.getWorldVector(new Vec2(1, 0));
    const currentForwardSpeed = Vec2.dot(currentVelocity, forwardVec);

    // сила против бокового скольжения
    const lateralVel = this.getLateralVelocity(body);
    const sidewaysForceMagnitude = -lateralVel * this._lateralGrip * this._mass;
    const sidewaysForceVec = body.getWorldVector(
      new Vec2(0, sidewaysForceMagnitude),
    );

    body.applyForceToCenter(sidewaysForceVec, true);

    // сила вперед/назад
    let forceMagnitude = 0;

    // эффективные силы на основе массы
    const effectiveForwardForce = this._baseForwardForceFactor * this._mass;
    const effectiveReverseForce = this._baseReverseForceFactor * this._mass;

    if (forward && currentForwardSpeed < this._maxForwardSpeed) {
      // эффективная сила вперед
      forceMagnitude = effectiveForwardForce;
    } else if (back) {
      if (
        currentForwardSpeed > 0 ||
        currentForwardSpeed > this._maxReverseSpeed
      ) {
        // эффективная сила назад
        forceMagnitude = -effectiveReverseForce;
      }
    }

    if (forceMagnitude !== 0) {
      const appliedForce = forwardVec.mul(forceMagnitude);
      body.applyForceToCenter(appliedForce, true);
    }

    // крутящий момент для поворота
    let torque = 0;
    let turnFactor = 1.0;

    // если скорость очень мала, используем базовый фактор
    if (Math.abs(currentForwardSpeed) < this._TURN_SPEED_THRESHOLD) {
      turnFactor = this._BASE_TURN_FACTOR_RATIO;
    }

    // если движение назад
    // дополнительно умножаем фактор на _REVERSE_TURN_MULTIPLIER
    if (back) {
      turnFactor *= this._REVERSE_TURN_MULTIPLIER;
    }

    // определяем направление руля по клавише "назад"
    const turnDirection = back ? -1 : 1;

    // масштабируем базовый фактор инерцией
    const effectiveTurnTorque = this._baseTurnTorqueFactor * this._inertia;

    if (left) {
      torque = -effectiveTurnTorque * turnFactor * turnDirection;
    }

    if (right) {
      torque = effectiveTurnTorque * turnFactor * turnDirection;
    }

    if (torque !== 0) {
      body.applyTorque(torque, true);
    }

    // смена оружия
    if (nextWeapon) {
      this.turnUserWeapon();
    }

    if (prevWeapon) {
      this.turnUserWeapon(true);
    }

    // обнуление клавиш в конце
    this.currentKeys = null;
  }

  getBody() {
    return this._body;
  }

  getData() {
    const data = {};

    if (this.fullUserData === true) {
      this.fullUserData = false;
      data.playerData = this.getFullData();
    } else {
      const pos = this._body.getPosition();
      const vel = this._body.getLinearVelocity();

      data.playerData = [
        Math.round(pos.x),
        Math.round(pos.y),
        +this._body.getAngle().toFixed(2),
        +this._body.gunRotation.toFixed(2),
        +vel.x.toFixed(1),
        +vel.y.toFixed(1),
        this._condition,
      ];
    }

    data.shotData = this._shotData;
    this._shotData = null;

    return data;
  }

  getFullData() {
    const pos = this._body.getPosition();
    const vel = this._body.getLinearVelocity();

    return [
      Math.round(pos.x), // координаты x
      Math.round(pos.y), // координаты y
      +this._body.getAngle().toFixed(2), // угол корпуса танка (радианы)
      +this._body.gunRotation.toFixed(2), // угол поворота башни (радианы)
      +vel.x.toFixed(1), // скорость по x (мировая)
      +vel.y.toFixed(1), // скорость по y (мировая)
      this._condition, // состояние танка
      this._modelData.size, // размер танка
      this.teamID, // id танка
    ];
  }
}

export default Tank;
