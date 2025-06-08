import BaseModel from './BaseModel.js';
import { BoxShape, Vec2, Rot } from 'planck';

class Tank extends BaseModel {
  // максимальный шаг в 1/30 секунды
  _MAX_DT = 1 / 30;

  // порог скорости для фактора поворота
  _TURN_SPEED_THRESHOLD = 10;

  // фактор поворота при низкой скорости
  _BASE_TURN_FACTOR_RATIO = 0.8;

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
    this._baseTurnTorqueFactor = 45; // коэффициент желаемой интенсивности поворота (зависит от инерции)
    this._maxForwardSpeed = 240; // целевая макс. скорость вперед (м/с или юнитов/с)
    this._maxReverseSpeed = -200; // целевая макс. скорость назад (м/с или юнитов/с)

    // затухание (Damping) контролирует, как быстро танк замедляется естественно
    // или прекращает поворачиваться.
    // большие значения = большее затухание (замедляется быстрее).
    this._linearDamping = 3.0; // сопротивление при движении (как сопротивление воздуха/трение)
    this._angularDamping = 10.0; // сопротивление при повороте

    // сила бокового сцепления
    // больше значение = меньше занос/скольжение
    this._lateralGrip = 9.0;

    // параметры орудия
    this._maxGunAngle = 1.4;
    this._gunRotationSpeed = 5; // скорость поворота башни

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

    this._body.setUserData({
      type: 'player',
      gameID: data.gameID,
      teamID: this.teamID,
    });

    this._mass = this._body.getMass(); // масса тела
    this._inertia = this._body.getInertia(); // сохранение момента инерции

    this._centeringGun = false;
    this._gunCenterSpeed = 5.0;

    // состояние танка:
    // 3 - норма,
    // 2 - незначительные повреждения,
    // 1 - значительные повреждения,
    // 0 - танк уничножен
    this._condition = 3;
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

    this._shotData = null; // сброс данных стрельбы

    // ограничение максимального dt, оно может сильно скакать
    dt = Math.min(dt, this._MAX_DT);

    // обновление кулдаунов оружия
    for (const weaponName in this.weaponRemainingCooldowns) {
      if (this.weaponRemainingCooldowns[weaponName] > 0) {
        // dt в секундах, fireRate в мс
        this.weaponRemainingCooldowns[weaponName] -= dt * 1000;
      }

      this.weaponRemainingCooldowns[weaponName] = Math.max(
        0,
        this.weaponRemainingCooldowns[weaponName],
      );
    }

    // сначала обновляем поворот башни (если нажаты клавиши)
    // это гарантирует, что gunRotation актуален перед расчетом выстрела
    if (gCenter) {
      this._centeringGun = true;
    }

    if (this._centeringGun) {
      body.gunRotation = this.lerp(
        body.gunRotation,
        0,
        Math.min(1, this._gunCenterSpeed * dt),
      );

      if (Math.abs(body.gunRotation) < 0.01) {
        // Если почти в центре
        body.gunRotation = 0;
        this._centeringGun = false;
      }

      // если во время центрирования нажали ручной поворот, отменяем центрирование
      if (gLeft || gRight) {
        this._centeringGun = false;
      }
    }

    // ручной поворот башни (только если не центрируемся)
    if (!this._centeringGun) {
      const rotationAmount = this._gunRotationSpeed * dt; // угол поворота за этот кадр

      if (gLeft) {
        if (body.gunRotation > -this._maxGunAngle) {
          body.gunRotation -= rotationAmount;

          if (body.gunRotation < -this._maxGunAngle) {
            body.gunRotation = -this._maxGunAngle;
          }
        }
      } else if (gRight) {
        if (body.gunRotation < this._maxGunAngle) {
          body.gunRotation += rotationAmount;

          if (body.gunRotation > this._maxGunAngle) {
            body.gunRotation = this._maxGunAngle;
          }
        }
      }
    }

    // если огонь
    if (fire) {
      const weaponName = this.currentWeapon;
      const weaponConfig = this.weapons[weaponName];

      // если проверка на кулдаун/патроны пройдена
      if (this._weaponRemainingCooldowns[weaponName] <= 0) {
        const currentAngle = body.getAngle();
        // factory weapon
        if (this.weaponConstructorType === 'factory') {
          const extraOffset = 20;
          const localBombOffset = new Vec2(-this._width / 2 - extraOffset, 0);

          this._shotData = {
            position: body.getWorldPoint(localBombOffset), // можно использовать текущее тело
            angle: currentAngle,
          };
          // hitscan weapon
        } else if (this.weaponConstructorType === 'hitscan') {
          this._shotData = {
            shooterBody: body, // тело самого стрелка
            startPoint: this.getMuzzlePosition(this.currentWeapon), // vec2
            direction: this.getFireDirection(this.currentWeapon), // нормализованный Vec2
          };
        }

        // установка кулдауна
        this.weaponRemainingCooldowns[weaponName] = weaponConfig.fireRate;
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

  getMuzzlePosition(weaponName) {
    const body = this.getBody();
    const totalAngle = body.getAngle() + (body.gunRotation || 0);
    const muzzleLocalOffsetX = this._width * 0.55;
    const muzzleLocalOffsetY = 0;
    const relPos = Rot.mulVec2(
      new Rot(totalAngle),
      new Vec2(muzzleLocalOffsetX, muzzleLocalOffsetY),
    );

    return Vec2.add(body.getPosition(), relPos);
  }

  getFireDirection(weaponName) {
    const body = this.getBody();
    const totalAngle = body.getAngle() + (body.gunRotation || 0);
    let directionVec = Rot.mulVec2(new Rot(totalAngle), new Vec2(1, 0)); // изначально Vec2

    const weaponConfig = this.weapons[weaponName];

    if (weaponConfig && weaponConfig.spread > 0) {
      const spreadVal = (Math.random() - 0.5) * 2 * weaponConfig.spread;
      // Rot.mulVec2 также возвращает новый Vec2
      directionVec = Rot.mulVec2(new Rot(spreadVal), directionVec);
    }

    directionVec.normalize(); // убедимся, что он нормализован

    return directionVec; // planck.Vec2
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
