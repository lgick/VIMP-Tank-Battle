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

  // как быстро "нажимается педаль газа" (единиц в секунду)
  _THROTTLE_INCREASE_RATE = 2.0;

  // как быстро "отпускается педаль газа"
  _THROTTLE_DECREASE_RATE = 2.5;

  // коэффициент, усиливающий нагрузку при сопротивлении
  _STRAIN_FACTOR = 1.5;

  constructor(data) {
    super(data);

    this._modelData = data.modelData;

    this._width = this._modelData.size * 4;
    this._height = this._modelData.size * 3;

    // коэффициент, определяющий скорость разгона и торможения
    this._accelerationFactor = this._modelData.accelerationFactor;

    // коэффициент, определяющий резкость остановки при отпускании клавиш
    this._brakingFactor = this._modelData.brakingFactor;

    this._baseTurnTorqueFactor = this._modelData.baseTurnTorqueFactor;
    this._maxForwardSpeed = this._modelData.maxForwardSpeed;
    this._maxReverseSpeed = this._modelData.maxReverseSpeed;

    this._lateralGrip = this._modelData.lateralGrip;

    this._maxGunAngle = this._modelData.maxGunAngle;
    this._gunRotationSpeed = this._modelData.gunRotationSpeed;
    this._gunCenterSpeed = this._modelData.gunCenterSpeed;

    this._shotData = null;

    this._engineThrottle = 0; // намерение игрока (0.0 до 1.0)
    this._engineLoad = 0; // нагрузка на двигатель для звука

    this._body = data.world.createBody({
      type: 'dynamic',
      position: new Vec2(data.position[0], data.position[1]),
      angle: data.angle * (Math.PI / 180),
      angularDamping: this._modelData.damping.angular,
      linearDamping: this._modelData.damping.linear,
    });

    this._body.gunRotation = 0;
    this._centeringGun = false;

    this._body.createFixture(
      new BoxShape(this._width / 2, this._height / 2),
      this._modelData.fixture,
    );

    this._body.setUserData({
      type: 'player',
      gameId: this.gameId,
      teamId: this.teamId,
    });

    this._mass = this._body.getMass(); // масса тела
    this._inertia = this._body.getInertia(); // момент инерции

    // базовый фактор инерцией
    this._effectiveTurnTorque = this._baseTurnTorqueFactor * this._inertia;

    // состояние танка:
    // 3 - норма,
    // 2 - незначительные повреждения,
    // 1 - значительные повреждения,
    // 0 - танк уничтожен
    this._condition = 3;

    this.takeDamage(0);
  }

  // линейная интерполяция между x и y, коэффициент a ∈ [0,1]
  lerp(x, y, a) {
    return x * (1 - a) + y * a;
  }

  // проверяет, жив ли танк
  isAlive() {
    return this._condition > 0;
  }

  // применяет урон к танку и обновляет его состояние.
  takeDamage(amount = 0) {
    // если танк уже уничтожен, урон не считать
    if (this._condition === 0) {
      return false;
    }

    const currentHealth = this.getHealth();
    const newHealth = Math.max(0, currentHealth - amount);

    this.setHealth(newHealth);

    if (newHealth <= 0) {
      this._condition = 0; // танк уничтожен

      // остановка танка при уничтожении,
      // сброс нажатых клавиш
      this._body.setLinearVelocity(new Vec2(0, 0));
      this._body.setAngularVelocity(0);
      this.resetKeys();

      return true;
    }

    // значительные повреждения
    if (newHealth < 35) {
      this._condition = 1;
      // незначительные повреждения
    } else if (newHealth < 70) {
      this._condition = 2;
      // норма
    } else {
      this._condition = 3;
    }

    return false;
  }

  // получение боковой скорости
  getLateralVelocity(body) {
    // вектор вправо отн. танка
    const currentRightNormal = body.getWorldVector(new Vec2(0, 1));
    // проекция скорости на правый вектор
    return Vec2.dot(currentRightNormal, body.getLinearVelocity());
  }

  updateData(dt) {
    const keys = this.getKeysForProcessing();

    const forward = Boolean(keys & this.keysData.forward);
    const back = Boolean(keys & this.keysData.back);
    const left = Boolean(keys & this.keysData.left);
    const right = Boolean(keys & this.keysData.right);
    const gCenter = Boolean(keys & this.keysData.gunCenter);
    const gLeft = Boolean(keys & this.keysData.gunLeft);
    const gRight = Boolean(keys & this.keysData.gunRight);
    const fire = Boolean(keys & this.keysData.fire);
    const nextWeapon = Boolean(keys & this.keysData.nextWeapon);
    const prevWeapon = Boolean(keys & this.keysData.prevWeapon);

    const body = this._body;

    this._shotData = null; // сброс данных стрельбы

    // ограничение максимального dt, оно может сильно скакать
    dt = Math.min(dt, this._MAX_DT);

    this.updateRemainingCooldowns(dt);

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

      // если во время центрирования нажали ручной поворот,
      // отменяем центрирование
      if (gLeft || gRight) {
        this._centeringGun = false;
      }
    } else {
      // ручной поворот башни (только если не центрируемся)
      // угол поворота за этот кадр
      const rotationAmount = this._gunRotationSpeed * dt;

      if (gLeft) {
        body.gunRotation = Math.max(
          -this._maxGunAngle,
          body.gunRotation - rotationAmount,
        );
      } else if (gRight) {
        body.gunRotation = Math.min(
          this._maxGunAngle,
          body.gunRotation + rotationAmount,
        );
      }
    }

    // если огонь
    if (fire) {
      if (this.tryConsumeAmmoAndShoot()) {
        // если проверка на кулдаун/патроны пройдена
        this._shotData = {
          bodyPosition: body.getPosition(),
          startPoint: this.getMuzzlePosition(this.currentWeapon),
          direction: this.getFireDirection(this.currentWeapon),
        };
      }
    }

    if (forward || back) {
      // игрок "давит на газ" - плавное увеличение до 1.0
      this._engineThrottle = Math.min(
        1.0,
        this._engineThrottle + this._THROTTLE_INCREASE_RATE * dt,
      );
    } else {
      // игрок "отпустил газ" - плавное уменьшение до 0.0
      this._engineThrottle = Math.max(
        0.0,
        this._engineThrottle - this._THROTTLE_DECREASE_RATE * dt,
      );
    }

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

    // применение физической силы на основе _engineThrottle
    let forceMagnitude = 0;

    // эффективная сила ускорения, зависящая от массы
    const effectiveAcceleration = this._accelerationFactor * this._mass;

    if (this._engineThrottle > 0) {
      if (forward && currentForwardSpeed < this._maxForwardSpeed) {
        forceMagnitude = this._engineThrottle * effectiveAcceleration;
      } else if (back && currentForwardSpeed > this._maxReverseSpeed) {
        forceMagnitude = -this._engineThrottle * effectiveAcceleration;
      }
    }

    // если газ отпущен, применение активного торможения
    if (forceMagnitude === 0 && !forward && !back) {
      const brakingForce =
        -currentForwardSpeed * this._brakingFactor * this._mass;
      forceMagnitude = brakingForce;
    }

    if (forceMagnitude !== 0) {
      const appliedForce = forwardVec.mul(forceMagnitude);
      body.applyForceToCenter(appliedForce, true);
    }

    // рассчёт нагрузки на двигатель (_engineLoad) для звука
    const speedRatio = this._getSpeedRatio(currentForwardSpeed);

    // нагрузка = намерение игрока + бонус за "напряжение"
    // напряжение - это разница между тем, как сильно игрок жмет газ,
    // и тем, насколько быстро танк на самом деле едет
    const strain = Math.max(0, this._engineThrottle - speedRatio);

    this._engineLoad = this._engineThrottle + strain * this._STRAIN_FACTOR;
    this._engineLoad = Math.max(0, this._engineLoad); // Ограничиваем снизу

    // крутящий момент для поворота
    let torque = 0;
    let turnFactor = 1.0;

    // если скорость очень мала, используем базовый фактор
    if (Math.abs(currentForwardSpeed) < this._TURN_SPEED_THRESHOLD) {
      turnFactor = this._BASE_TURN_FACTOR_RATIO;
    }

    // если движение назад,
    // дополнительно умножение фактора на _REVERSE_TURN_MULTIPLIER
    if (back) {
      turnFactor *= this._REVERSE_TURN_MULTIPLIER;
    }

    // определяем направление руля по клавише "назад"
    const turnDirection = back ? -1 : 1;

    if (left) {
      torque = -this._effectiveTurnTorque * turnFactor * turnDirection;
    }

    if (right) {
      torque = this._effectiveTurnTorque * turnFactor * turnDirection;
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
  }

  getMuzzlePosition() {
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
    let directionVec = Rot.mulVec2(new Rot(totalAngle), new Vec2(1, 0));
    const weaponConfig = this.weapons[weaponName];

    if (weaponConfig && weaponConfig.spread > 0) {
      const spreadVal = (Math.random() - 0.5) * 2 * weaponConfig.spread;
      directionVec = Rot.mulVec2(new Rot(spreadVal), directionVec);
    }

    directionVec.normalize();

    return directionVec;
  }

  getBody() {
    return this._body;
  }

  getPosition() {
    const body = this.getBody();
    const position = body.getPosition();
    const angle = body.getAngle();

    return [+position.x.toFixed(2), +position.y.toFixed(2), +angle.toFixed(2)];
  }

  // меняет данные игрока (координаты, команду)
  changePlayerData(data) {
    const respawnData = data.respawnData;
    const x = respawnData[0];
    const y = respawnData[1];
    const angle = respawnData[2] * (Math.PI / 180);
    const body = this._body;

    this.teamId = data.teamId;
    this._body.setUserData({
      type: 'player',
      gameId: this.gameId,
      teamId: this.teamId,
    });

    // остановка танка
    body.setLinearVelocity(new Vec2(0, 0));
    body.setAngularVelocity(0);
    body.setPosition(new Vec2(x, y));
    body.setAngle(angle);
    this._body.gunRotation = 0;
    this.fullUserData = true;
  }

  _getSpeedRatio(currentForwardSpeed) {
    let speedRatio = 0;

    if (currentForwardSpeed > 0) {
      speedRatio = Math.min(currentForwardSpeed / this._maxForwardSpeed, 1);
    } else if (currentForwardSpeed < 0) {
      speedRatio = Math.min(
        Math.abs(currentForwardSpeed / this._maxReverseSpeed),
        1,
      );
    }

    return +speedRatio.toFixed(4);
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
        +pos.x.toFixed(2),
        +pos.y.toFixed(2),
        +this._body.getAngle().toFixed(2),
        +this._body.gunRotation.toFixed(2),
        +vel.x.toFixed(2),
        +vel.y.toFixed(2),
        +this._engineLoad.toFixed(2),
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
      +pos.x.toFixed(2), // координаты x
      +pos.y.toFixed(2), // координаты y
      +this._body.getAngle().toFixed(2), // угол корпуса танка (радианы)
      +this._body.gunRotation.toFixed(2), // угол поворота башни (радианы)
      +vel.x.toFixed(2), // скорость по x (мировая)
      +vel.y.toFixed(2), // скорость по y (мировая)
      +this._engineLoad.toFixed(2), // нагрузка двигателя
      this._condition, // состояние танка
      this._modelData.size, // размер танка
      this.teamId, // id команды
    ];
  }
}

export default Tank;
