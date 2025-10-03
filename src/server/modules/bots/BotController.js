import { Vec2, Rot } from 'planck';

// константы для поведения бота
const AI_UPDATE_INTERVAL = 0.2; // как часто бот принимает решения (в секундах)
const TARGET_PREDICTION_FACTOR = 0.2; // коэффициент для упреждения цели
const OBSTACLE_AVOIDANCE_RAY_LENGTH = 150; // длина лучей для обхода препятствий
const MIN_TARGET_DISTANCE = 80; // минимальная дистанция до цели
const MAX_FIRING_DISTANCE = 500; // максимальная дистанция для ведения огня

// константы для снижения меткости
// максимальная случайная погрешность прицеливания в радианах
// (0.05 радиана ~ 3 градуса)
const AIM_INACCURACY = 0.5;
// минимальная задержка перед выстрелом (в секундах)
const MIN_FIRING_DELAY = 2;
// дополнительная случайная задержка
// (итоговая задержка будет от 0.8 до 1.3 секунды)
const RANDOM_FIRING_DELAY = 0.5;

// константы для использования бомб
const BOMB_USAGE_DISTANCE = 50; // дистанция для использования бомбы
const BOMB_COOLDOWN = 0.5; // перезарядка бомбы в секундах

const REPATH_INTERVAL = 1.0; // частота пересчёта пути (секунды)
const TARGET_SCAN_INTERVAL = 1.5; // интервал поиска новой цели (секунды)

class BotController {
  constructor(vimp, game, panel, botData) {
    this._vimp = vimp;
    this._game = game;
    this._panel = panel;
    this._botData = botData;
    this._world = this._game._world;

    this._target = null;
    this.state = 'IDLE';

    // свойства для навигации
    this._path = null;
    this._pathIndex = 0;

    this._repathTimer = Math.random() * REPATH_INTERVAL;
    this._targetScanTimer = Math.random() * TARGET_SCAN_INTERVAL;

    this._aiUpdateTimer = 0;
    this._firingTimer = 0;
    this._bombCooldownTimer = 0;

    this._lastKnownPosition = null;
    this._repathTimer = 0; // таймер для пересчета пути

    this._keyStates = {
      forward: false,
      back: false,
      left: false,
      right: false,
      gunLeft: false,
      gunRight: false,
    };
  }

  _setKeyState(keyName, isDown) {
    if (this._keyStates[keyName] !== isDown) {
      this._keyStates[keyName] = isDown;
      const action = isDown ? 'down' : 'up';
      this._game.updateKeys(this._botData.gameId, { action, name: keyName });
    }
  }

  update(dt) {
    if (!this._game.isAlive(this._botData.gameId)) {
      if (this.state !== 'DEAD') {
        this.state = 'DEAD';
        this.releaseAllKeys();
      }

      return;
    }

    this._aiUpdateTimer -= dt;
    this._firingTimer = Math.max(0, this._firingTimer - dt);
    this._bombCooldownTimer = Math.max(0, this._bombCooldownTimer - dt);
    this._repathTimer -= dt;
    this._targetScanTimer -= dt;

    if (this._aiUpdateTimer <= 0) {
      this._aiUpdateTimer = AI_UPDATE_INTERVAL;
      this.makeDecision();
    }

    this.executeMovement();
    this.executeAimAndShoot();
  }

  makeDecision() {
    if (this._targetScanTimer > 0) {
      return;
    }

    this._targetScanTimer = TARGET_SCAN_INTERVAL;

    this._target = this.findClosestEnemy();

    if (this._target) {
      // последняя валидная позиция
      const targetPos = this._game.getPosition(this._target.gameId);
      if (targetPos) {
        this._lastKnownPosition = new Vec2(targetPos[0], targetPos[1]);
      }
    } else {
      // если цели вообще нет, возможно, стоит пойти к последнему месту,
      // где она была
      if (this.state !== 'SEARCHING' && this._lastKnownPosition) {
        this.state = 'SEARCHING';
      } else {
        this.state = 'IDLE';
      }
      return;
    }

    const targetIsVisible = this.hasLineOfSight(this._target);

    // если есть цель в прямой видимости
    if (targetIsVisible) {
      this.state = 'ATTACKING';
      this._path = null; // сброс старого пути
      // если цель есть, но не видима
    } else {
      this.state = 'NAVIGATING';
    }
  }

  findClosestEnemy() {
    const myPosArray = this.getBotPosition();

    if (!myPosArray) {
      return null;
    }

    const myPosition = new Vec2(myPosArray[0], myPosArray[1]);

    let closestEnemy = null;
    let minDistanceSq = Infinity;
    const potentialTargets = [
      ...Object.values(this._vimp._users),
      ...this._vimp._bots.getBots(),
    ];

    potentialTargets.forEach(p => {
      if (
        p.gameId === this._botData.gameId ||
        p.teamId === this._botData.teamId ||
        p.teamId === this._vimp._spectatorId
      ) {
        return;
      }

      if (this._game.isAlive(p.gameId)) {
        const enemyPosArray = this._game.getPosition(p.gameId);

        if (!enemyPosArray) {
          return;
        }

        const enemyPosition = new Vec2(enemyPosArray[0], enemyPosArray[1]);
        const distanceSq = Vec2.distanceSquared(myPosition, enemyPosition);

        if (distanceSq < minDistanceSq) {
          minDistanceSq = distanceSq;
          closestEnemy = p;
        }
      }
    });

    return closestEnemy;
  }

  releaseAllKeys() {
    Object.keys(this._keyStates).forEach(key => this._setKeyState(key, false));
  }

  executeMovement() {
    if (!this._target || !this._game.isAlive(this._target.gameId)) {
      this._target = null;
      this.state = 'IDLE';
      this._path = null;
      this.releaseAllKeys();
      return;
    }

    if (this.state === 'ATTACKING' && this._target) {
      this.moveTo(this._target.gameId);

      // если в процессе атаки враг скрылся
      if (!this.hasLineOfSight(this._target)) {
        this.state = 'NAVIGATING';
      }
    } else if (this.state === 'NAVIGATING') {
      this.navigateAlongPath();
    } else if (this.state === 'SEARCHING') {
      this.moveTo(this._lastKnownPosition, true);
      // если добравшись до мест враг не обнаружен, обнуление и переход в IDLE
      const myPos = this.getBotPosition();

      if (myPos) {
        const myPosVec = new Vec2(myPos[0], myPos[1]);
        if (
          Vec2.distanceSquared(myPosVec, this._lastKnownPosition) <
          MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
        ) {
          this._lastKnownPosition = null;
          this.state = 'IDLE';
        }
      }
    } else {
      // IDLE
      this.releaseAllKeys();
    }
  }

  /**
   * @description Двигает бота к указанной цели.
   * Умеет двигаться как к динамической цели (игроку),
   * так и к статической точке (координате).
   * @param {string|Vec2} target - gameId игрока
   * или объект Vec2 с координатами точки.
   * @param {boolean} [isStaticPoint=false] - Флаг, указывающий, что цель —
   * это статическая точка.
   */
  moveTo(target, isStaticPoint = false) {
    const myBody = this._game._playersData[this._botData.gameId]?.getBody();

    // если тела бота нет
    if (!myBody) {
      return;
    }

    let targetPosition;
    const myPosition = myBody.getPosition();

    // определение координат цели
    // если цель - это просто точка на карте (например, из системы навигации),
    // то target уже является объектом Vec2
    if (isStaticPoint) {
      targetPosition = target;
      // иначе, если цель - это другой игрок, то target - это его gameId.
      // поиск его позиции и попытка предсказать, куда он будет двигаться
    } else {
      const targetPosArray = this._game.getPosition(target);

      // если цель больше не существует
      if (!targetPosArray) {
        return;
      }

      targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);

      const targetBody = this._game._playersData[target]?.getBody();

      if (targetBody) {
        // упреждение: добавляем к текущей позиции цели её вектор скорости,
        // чтобы бот целился немного "наперёд"
        const targetVelocity = Vec2.clone(targetBody.getLinearVelocity());
        targetPosition.add(targetVelocity.mul(TARGET_PREDICTION_FACTOR));
      }
    }

    // вектор и дистанция до цели
    const directionToTarget = Vec2.sub(targetPosition, myPosition);

    // если достаточно близко до цели, прекращение движения вперёд
    // (это предотвращает "толкание" цели)
    if (
      directionToTarget.lengthSquared() <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._setKeyState('forward', false);
      return;
    }

    // нормализация вектора направления и
    // корректировка его для обхода препятствий
    const dirToTargetNorm = Vec2.clone(directionToTarget);

    dirToTargetNorm.normalize();

    // использование локального избегание препятствий,
    // чтобы не врезаться в углы и мелкие объекты
    const finalDirection = this.avoidObstacles(myBody, dirToTargetNorm);

    // вычисление угла для поворота корпуса танка
    // направление "вперёд" для танка
    const forwardVec = myBody.getWorldVector(new Vec2(1, 0));
    const angleToTarget = Math.atan2(
      Vec2.cross(forwardVec, finalDirection),
      Vec2.dot(forwardVec, finalDirection),
    );

    // устанавливка команды для поворота
    // порог в радианах, чтобы избежать мелкого дрожания.
    const turnThreshold = 0.2;

    if (angleToTarget > turnThreshold) {
      this._setKeyState('right', true);
      this._setKeyState('left', false);
    } else if (angleToTarget < -turnThreshold) {
      this._setKeyState('left', true);
      this._setKeyState('right', false);
    } else {
      // прицед настроен, поворачивать не нужно
      this._setKeyState('left', false);
      this._setKeyState('right', false);
    }

    // устанавка команды для движения вперёд
    // движение вперёд, только если угол до цели не слишком большой
    // это предотвращает движение боком и помогает сначала повернуться,
    // а потом ехать
    if (Math.abs(angleToTarget) < Math.PI / 1.5) {
      this._setKeyState('forward', true);
    } else {
      this._setKeyState('forward', false);
    }
  }

  /**
   * @description Навигация по точкам маршрута.
   */
  navigateAlongPath() {
    // если цели нет
    if (!this._target) {
      this.makeDecision();
      return;
    }

    // уменьшение таймера на время "кадра" ИИ
    this._repathTimer -= AI_UPDATE_INTERVAL;

    const myPosArray = this.getBotPosition();
    const targetPosArray = this._game.getPosition(this._target.gameId);

    if (!myPosArray || !targetPosArray) {
      return;
    }

    // если цель обнаружена
    if (this.hasLineOfSight(this._target)) {
      this.state = 'ATTACKING';
      this._path = null;
      return;
    }

    // если таймер истек
    if (this._repathTimer <= 0) {
      this._repathTimer = REPATH_INTERVAL; // сброс таймера

      const startVec = new Vec2(myPosArray[0], myPosArray[1]);
      const endVec = new Vec2(targetPosArray[0], targetPosArray[1]);
      const newPath = this._vimp._bots.findPath(startVec, endVec);

      if (newPath && newPath.length > 0) {
        this._path = newPath;
        this._pathIndex = 0;
      } else {
        // если путь не найден
        this.state = 'SEARCHING';
        console.log(
          `[BOT DEBUG] ${this._botData.gameId}: Path could not be recalculated. Switching to IDLE.`,
        );
        return;
      }
    }

    if (!this._path || this._pathIndex >= this._path.length) {
      return;
    }

    // движение к следующей точке маршрута
    const nextWaypoint = this._path[this._pathIndex];
    this.moveTo(nextWaypoint, true);

    // проверка достижения цели в текущей точки
    const myPositionVec = new Vec2(myPosArray[0], myPosArray[1]);
    const distanceToWaypointSq = Vec2.distanceSquared(
      myPositionVec,
      nextWaypoint,
    );

    const waypointReachedThreshold = MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE;

    if (distanceToWaypointSq < waypointReachedThreshold) {
      this._pathIndex += 1;
    }
  }

  avoidObstacles(myBody, desiredDirection) {
    const myPosition = myBody.getPosition();
    const rays = {
      center: desiredDirection,
      left: Rot.mulVec2(new Rot(Math.PI / 6), desiredDirection),
      right: Rot.mulVec2(new Rot(-Math.PI / 6), desiredDirection),
    };
    const steerCorrection = new Vec2(0, 0);
    let obstaclesDetected = false;

    for (const dir in rays) {
      const endPoint = Vec2.add(
        myPosition,
        rays[dir].mul(OBSTACLE_AVOIDANCE_RAY_LENGTH),
      );
      let hit = false;

      this._world.rayCast(myPosition, endPoint, fixture => {
        if (fixture.getBody() !== myBody && !fixture.isSensor()) {
          hit = true;

          return 0;
        }

        return -1;
      });

      if (hit) {
        obstaclesDetected = true;
        steerCorrection.sub(rays[dir]);
      }
    }

    if (obstaclesDetected) {
      const correctedDir = steerCorrection.add(desiredDirection);
      correctedDir.normalize();

      return correctedDir;
    }

    return desiredDirection;
  }

  executeAimAndShoot() {
    if (
      this.state !== 'ATTACKING' ||
      !this._target ||
      !this._game.isAlive(this._target.gameId)
    ) {
      this._target = null;
      this.state = 'IDLE';
      this._setKeyState('gunLeft', false);
      this._setKeyState('gunRight', false);
      return;
    }

    const botTank = this._game._playersData[this._botData.gameId];

    if (!botTank) {
      return;
    }

    const myBody = botTank.getBody();
    const targetPosArray = this._game.getPosition(this._target.gameId);

    if (!targetPosArray) {
      return;
    }

    const myPosition = myBody.getPosition();
    const targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);
    const directionToTarget = Vec2.sub(targetPosition, myPosition);
    const distanceToTargetSq = directionToTarget.lengthSquared();

    const shouldUseBomb =
      distanceToTargetSq < BOMB_USAGE_DISTANCE * BOMB_USAGE_DISTANCE &&
      this._bombCooldownTimer <= 0;
    const currentWeapon = botTank.currentWeapon;

    if (shouldUseBomb) {
      if (currentWeapon !== 'w2') {
        this._game.updateKeys(this._botData.gameId, {
          action: 'down',
          name: 'nextWeapon',
        });
        return;
      }
    } else if (currentWeapon === 'w2') {
      this._game.updateKeys(this._botData.gameId, {
        action: 'down',
        name: 'nextWeapon',
      });
      return;
    }

    // логика прицеливания
    let targetAngle = Math.atan2(directionToTarget.y, directionToTarget.x);
    const randomInaccuracy = (Math.random() - 0.5) * AIM_INACCURACY;
    targetAngle += randomInaccuracy;

    const currentGunAngle = myBody.getAngle() + myBody.gunRotation;
    let angleDifference = targetAngle - currentGunAngle;
    angleDifference = Math.atan2(
      Math.sin(angleDifference),
      Math.cos(angleDifference),
    );

    const aimThreshold = 0.05;
    if (angleDifference > aimThreshold) {
      this._setKeyState('gunRight', true);
      this._setKeyState('gunLeft', false);
    } else if (angleDifference < -aimThreshold) {
      this._setKeyState('gunLeft', true);
      this._setKeyState('gunRight', false);
    } else {
      this._setKeyState('gunLeft', false);
      this._setKeyState('gunRight', false);

      // логика стрельбы
      const targetIsVisible = this.hasLineOfSight(this._target);
      const weaponCooldownReady = this._firingTimer <= 0;

      if (targetIsVisible) {
        if (shouldUseBomb && currentWeapon === 'w2') {
          if (this._panel.hasResources(this._botData.gameId, 'w2', 1)) {
            this._game.updateKeys(this._botData.gameId, {
              action: 'down',
              name: 'fire',
            });
            this._bombCooldownTimer = BOMB_COOLDOWN;
          }
        } else if (
          !shouldUseBomb &&
          currentWeapon === 'w1' &&
          weaponCooldownReady
        ) {
          const targetInRange =
            distanceToTargetSq < MAX_FIRING_DISTANCE * MAX_FIRING_DISTANCE;
          if (targetInRange) {
            this._firingTimer =
              MIN_FIRING_DELAY + Math.random() * RANDOM_FIRING_DELAY;
            if (this._panel.hasResources(this._botData.gameId, 'w1', 1)) {
              this._game.updateKeys(this._botData.gameId, {
                action: 'down',
                name: 'fire',
              });
            }
          }
        }
      }
    }
  }

  hasLineOfSight(target) {
    const myBody = this._game._playersData[this._botData.gameId]?.getBody();

    if (!myBody) {
      return false;
    }

    const startPoint = myBody.getPosition();
    const endPosArray = this._game.getPosition(target.gameId);

    if (!endPosArray) {
      return false;
    }

    const endPoint = new Vec2(endPosArray[0], endPosArray[1]);
    let isVisible = false;

    this._world.rayCast(startPoint, endPoint, fixture => {
      const hitBody = fixture.getBody();

      if (hitBody === myBody || fixture.isSensor()) {
        return -1.0;
      }

      const hitUserData = hitBody.getUserData();
      isVisible = hitUserData && hitUserData.gameId === target.gameId;

      return 0;
    });

    return isVisible;
  }

  getBotPosition() {
    try {
      return this._game.getPosition(this._botData.gameId);
    } catch (e) {
      return null;
    }
  }

  isBehindCover() {
    return false;
  }

  destroy() {
    this._target = null;
    this.state = 'DEAD';
  }
}

export default BotController;
