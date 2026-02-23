import BaseModel from './BaseModel.js';
import { BoxShape, Vec2 } from 'planck';
import { lerp, degToRad, clamp } from '../../lib/math.js';

const FORWARD = new Vec2(1, 0);
const RIGHT = new Vec2(0, 1);
const ZERO = new Vec2(0, 0);

class Tank extends BaseModel {
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

    this._body = data.body;
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
    this._weaponChangeStatus = 0;

    this._engineThrottle = 0; // намерение игрока (0.0 до 1.0)
    this._engineLoad = 0; // нагрузка на двигатель для звука

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
  }

  // остановка танка при уничтожении/респауне, сброс нажатых клавиш
  reset() {
    this._body.setLinearVelocity(ZERO);
    this._body.setAngularVelocity(0);
    this._body.gunRotation = 0;

    // сброс физики управления
    this._engineThrottle = 0;
    this._engineLoad = 0;
    this._centeringGun = false;

    this.resetKeys();
  }

  // меняет данные игрока (координаты, команду)
  changePlayerData(data) {
    const [x, y, angle] = data.respawnData;
    const body = this._body;

    this.reset();

    this.teamId = data.teamId;

    body.setUserData({
      type: 'player',
      gameId: this.gameId,
      teamId: this.teamId,
    });

    body.setPosition(new Vec2(x, y));
    body.setAngle(degToRad(angle));
  }

  // обновление данных танка
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

    // сначала обновляем поворот башни (если нажаты клавиши)
    // это гарантирует, что gunRotation актуален перед расчетом выстрела
    if (gCenter) {
      this._centeringGun = true;
    }

    if (this._centeringGun) {
      body.gunRotation = lerp(
        body.gunRotation,
        0,
        Math.min(1, this._gunCenterSpeed * dt),
      );

      // если почти в центре
      if (Math.abs(body.gunRotation) < 0.01) {
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
      this._shotData = {
        position: body.getPosition(),
        angle: body.getAngle() + body.gunRotation,
        tankWidth: this._width,
      };
    }

    // если игрок "давит на газ" - плавное увеличение до 1.0
    if (forward || back) {
      this._engineThrottle = Math.min(
        1.0,
        this._engineThrottle + this._THROTTLE_INCREASE_RATE * dt,
      );
      // иначе, игрок "отпустил газ" - плавное уменьшение до 0.0
    } else {
      this._engineThrottle = Math.max(
        0.0,
        this._engineThrottle - this._THROTTLE_DECREASE_RATE * dt,
      );
    }

    const currentVelocity = body.getLinearVelocity();
    const forwardVec = body.getWorldVector(FORWARD);
    const currentForwardSpeed = Vec2.dot(currentVelocity, forwardVec);

    // сила против бокового скольжения
    const lateralVel = Vec2.dot(
      body.getWorldVector(RIGHT),
      body.getLinearVelocity(),
    );
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
      forceMagnitude = -currentForwardSpeed * this._brakingFactor * this._mass;
    }

    if (forceMagnitude !== 0) {
      const appliedForce = forwardVec.mul(forceMagnitude);
      body.applyForceToCenter(appliedForce, true);
    }

    // расчёт нагрузки на двигатель (_engineLoad) для звука
    let speedRatio = 0;

    if (currentForwardSpeed > 0) {
      speedRatio = clamp(currentForwardSpeed / this._maxForwardSpeed, 0, 1);
    } else if (currentForwardSpeed < 0) {
      speedRatio = clamp(
        Math.abs(currentForwardSpeed / this._maxReverseSpeed),
        0,
        1,
      );
    }

    // нагрузка = намерение игрока + бонус за "напряжение"
    // напряжение - это разница между тем, как сильно игрок жмет газ,
    // и тем, насколько быстро танк на самом деле едет
    const strain = Math.max(0, this._engineThrottle - speedRatio);

    this._engineLoad = this._engineThrottle + strain * this._STRAIN_FACTOR;

    // ограничение диапазона от 0.0 до 2.0 (или 1.5)
    // 0.0 - тишина
    // 1.0 - обычная езда
    // >1.0 - нагрузка (упор в стену, разгон в гору)
    this._engineLoad = clamp(this._engineLoad, 0, 2.0);

    // крутящий момент для поворота
    let torque = 0;

    // базовый фактор поворота
    let turnFactor = 1.0;

    // если скорость очень мала, используем базовый фактор
    if (Math.abs(currentForwardSpeed) < this._TURN_SPEED_THRESHOLD) {
      turnFactor = this._BASE_TURN_FACTOR_RATIO;
    }

    // если движение назад,
    // дополнительно умножение фактора на _REVERSE_TURN_MULTIPLIER
    if (currentForwardSpeed < 0) {
      turnFactor *= this._REVERSE_TURN_MULTIPLIER;
    }

    if (left) {
      torque = -this._effectiveTurnTorque * turnFactor;
    }

    if (right) {
      torque = this._effectiveTurnTorque * turnFactor;
    }

    if (torque !== 0) {
      body.applyTorque(torque, true);
    }

    // смена оружия
    if (nextWeapon) {
      this._weaponChangeStatus = 1;
    }

    if (prevWeapon) {
      this._weaponChangeStatus = -1;
    }
  }

  // получение тела танка
  getBody() {
    return this._body;
  }

  // получение позиции танка
  getPosition() {
    return this._body.getPosition();
  }

  // возвращает и сбрасывает данные о смене оружия
  consumeWeaponChangeStatus() {
    const status = this._weaponChangeStatus;

    this._weaponChangeStatus = 0;

    return status;
  }

  // возвращает и сбрасывает данные о выстреле
  consumeShotData() {
    const data = this._shotData;

    this._shotData = null;

    return data;
  }

  // возвращает состояние танка
  getData() {
    const body = this._body;
    const pos = body.getPosition();
    const vel = body.getLinearVelocity();

    return [
      pos.x,
      pos.y,
      body.getAngle(),
      body.gunRotation,
      vel.x,
      vel.y,
      this._engineLoad,
    ];
  }
}

export default Tank;
