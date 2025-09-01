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

    this._baseForwardForceFactor = this._modelData.baseForwardForceFactor;
    this._baseReverseForceFactor = this._modelData.baseReverseForceFactor;
    this._baseTurnTorqueFactor = this._modelData.baseTurnTorqueFactor;
    this._maxForwardSpeed = this._modelData.maxForwardSpeed;
    this._maxReverseSpeed = this._modelData.maxReverseSpeed;

    this._lateralGrip = this._modelData.lateralGrip;

    this._maxGunAngle = this._modelData.maxGunAngle;
    this._gunRotationSpeed = this._modelData.gunRotationSpeed;
    this._gunCenterSpeed = this._modelData.gunCenterSpeed;

    this._shotData = null;

    this._body = data.world.createBody({
      type: 'dynamic',
      position: new Vec2(data.position[0], data.position[1]),
      angle: data.angle * (Math.PI / 180),
      angularDamping: this._modelData.damping.angular,
      linearDamping: this._modelData.damping.linear,
      allowSleep: false,
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
    // 0 - танк уничножен
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
      // ручной поворот башни (только если не центрируемся)
    } else {
      // угол поворота за этот кадр
      const rotationAmount = this._gunRotationSpeed * dt;

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
      // если проверка на кулдаун/патроны пройдена
      if (this.tryConsumeAmmoAndShoot()) {
        const currentAngle = body.getAngle();
        // explosive weapon
        if (this.weaponConstructorType === 'explosive') {
          const extraOffset = 20;
          const localBombOffset = new Vec2(-this._width / 2 - extraOffset, 0);

          this._shotData = {
            position: body.getWorldPoint(localBombOffset),
            angle: currentAngle,
          };
          // hitscan weapon
        } else if (this.weaponConstructorType === 'hitscan') {
          this._shotData = {
            shooterBody: body,
            soundPoint: body.getPosition(),
            startPoint: this.getMuzzlePosition(this.currentWeapon),
            direction: this.getFireDirection(this.currentWeapon),
          };
        }
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
      // Rot.mulVec2 также возвращает новый Vec2
      directionVec = Rot.mulVec2(new Rot(spreadVal), directionVec);
    }

    directionVec.normalize(); // убедимся, что он нормализован

    return directionVec; // planck.Vec2
  }

  getBody() {
    return this._body;
  }

  getPosition() {
    const body = this.getBody();
    const position = body.getPosition();
    const angle = body.getAngle();

    return [+position.x.toFixed(), +position.y.toFixed(), +angle.toFixed(2)];
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
      this.teamId, // id танка
    ];
  }
}

export default Tank;
