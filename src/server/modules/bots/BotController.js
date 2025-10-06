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

/**
 * @class BotController
 * @description Управляет поведением одного бота:
 * навигацией, прицеливанием, стрельбой и принятием решений.
 */
class BotController {
  /**
   * @param {VIMP} vimp
   * @param {Game} game
   * @param {Panel} panel
   * @param {SpatialManager} spatialManager
   * @param {object} botData
   */
  constructor(vimp, game, panel, spatialManager, botData) {
    this._vimp = vimp;
    this._game = game;
    this._panel = panel;
    this._botData = botData;
    // --- ИЗМЕНЕНИЕ: Возвращаем доступ к миру для rayCast ---
    this._world = this._game._world;

    this._target = null;
    this.state = 'PATROLLING';

    // свойства для навигации
    this._path = null;
    this._pathIndex = 0;

    this._repathTimer = Math.random() * REPATH_INTERVAL;
    this._targetScanTimer = Math.random() * TARGET_SCAN_INTERVAL;

    this._aiUpdateTimer = 0;
    this._firingTimer = 0;
    this._bombCooldownTimer = 0;

    this._lastKnownPosition = null;

    // свойства для обнаружения застревания
    this._stuckTimer = 0;
    this._lastPosition = null;

    // свойства для тактики "стреляй и двигайся"
    this._repositionTimer = 0;
    this._repositionTarget = null;

    /** @type {Vec2 | null} */
    this._patrolTarget = null;

    this._keyStates = {
      forward: false,
      back: false,
      left: false,
      right: false,
      gunLeft: false,
      gunRight: false,
    };

    this._spatialManager = spatialManager;

    /** @type {number[] | null} */
    this._myPosition = null;
    /** @type {planck.Body | null} */
    this._myBody = null;
  }

  /**
   * @description Обновляет состояние нажатия клавиш и отправляет команду в игру.
   * @param {string} keyName - Название клавиши.
   * @param {boolean} isDown - true, если клавиша нажата, иначе false.
   * @private
   */
  _setKeyState(keyName, isDown) {
    if (this._keyStates[keyName] !== isDown) {
      this._keyStates[keyName] = isDown;
      const action = isDown ? 'down' : 'up';
      this._game.updateKeys(this._botData.gameId, { action, name: keyName });
    }
  }

  /**
   * @description Кэширует данные о положении и теле бота в начале кадра.
   * @private
   */
  _updateCachedData() {
    try {
      this._myPosition = this._game.getPosition(this._botData.gameId);
      this._myBody = this._game._playersData[this._botData.gameId]?.getBody();
    } catch (e) {
      this._myPosition = null;
      this._myBody = null;
    }
  }

  /**
   * @description Главный метод обновления, вызывается в каждом игровом цикле.
   * @param {number} dt - Время, прошедшее с последнего кадра (delta time).
   */
  update(dt) {
    this._updateCachedData();

    if (!this._myBody || !this._game.isAlive(this._botData.gameId)) {
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
    this._repositionTimer = Math.max(0, this._repositionTimer - dt);

    // обнаружение застревания
    this._stuckTimer += dt;
    if (this._stuckTimer >= 1.5) {
      this._stuckTimer = 0;
      const currentPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
      if (this._lastPosition) {
        const distSq = Vec2.distanceSquared(currentPosVec, this._lastPosition);
        if (
          (this.state === 'NAVIGATING' ||
            this.state === 'SEARCHING' ||
            this.state === 'PATROLLING') &&
          distSq < 10
        ) {
          this.state = 'CLEARING_OBSTACLE';
        }
      }
      this._lastPosition = currentPosVec;
    }

    if (this._aiUpdateTimer <= 0) {
      this._aiUpdateTimer = AI_UPDATE_INTERVAL;
      this.makeDecision();
    }

    if (this.state === 'CLEARING_OBSTACLE') {
      this.handleClearingObstacle();
    } else {
      this.executeMovement();
      this.executeAimAndShoot();
    }
  }

  /**
   * @description Основная логика принятия решений.
   * Приоритеты: 1. Атаковать видимого врага. 2. Двигаться к последней позиции врага. 3. Патрулировать.
   */
  makeDecision() {
    if (this._targetScanTimer > 0 && this.state !== 'PATROLLING') return;
    this._targetScanTimer = TARGET_SCAN_INTERVAL;

    this._target = this.findClosestEnemy();

    if (this._target) {
      this._patrolTarget = null;
      this._path = null;
      const targetPos = this._game.getPosition(this._target.gameId);

      if (targetPos) {
        this._lastKnownPosition = new Vec2(targetPos[0], targetPos[1]);
        const isVisible = this._vimp._bots.hasLineOfSight(
          new Vec2(this._myPosition[0], this._myPosition[1]),
          this._lastKnownPosition,
        );
        this.state = isVisible ? 'ATTACKING' : 'NAVIGATING';
      }
      return;
    }

    if (this._lastKnownPosition) {
      this.state = 'SEARCHING';
      return;
    }

    this.state = 'PATROLLING';
    if (!this._patrolTarget) {
      this.setNewPatrolTarget();
    }
  }

  /**
   * @description Устанавливает новую случайную цель для патрулирования и строит к ней путь.
   * @private
   */
  setNewPatrolTarget() {
    const randomNode = this._vimp._bots.getRandomNavNode();
    if (randomNode && this._myPosition) {
      this._patrolTarget = randomNode;
      const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
      this._path = this._vimp._bots.findPath(myPosVec, this._patrolTarget);
      this._pathIndex = 0;
    }
  }

  /**
   * @description Выполняет логику движения в зависимости от текущего состояния бота.
   */
  executeMovement() {
    if (this._target && !this._game.isAlive(this._target.gameId)) {
      this._target = null;
      this._lastKnownPosition = null;
      this.makeDecision();
      return;
    }

    if (this.state === 'ATTACKING' || this.state === 'NAVIGATING') {
      if (!this._target) return;
      if (this._repositionTimer > 0 && this._repositionTarget) {
        this.moveTo(this._repositionTarget, true);
        const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
        if (Vec2.distanceSquared(myPosVec, this._repositionTarget) < 50 * 50) {
          this._repositionTimer = 0;
        }
      } else {
        this.moveTo(this._target.gameId);
      }
      return;
    }

    if (this.state === 'SEARCHING' && this._lastKnownPosition) {
      this.moveTo(this._lastKnownPosition, true);
      const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
      if (
        Vec2.distanceSquared(myPosVec, this._lastKnownPosition) <
        MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
      ) {
        this._lastKnownPosition = null;
      }
      return;
    }

    if (this.state === 'PATROLLING') {
      if (this._path && this._patrolTarget) {
        this.followPath();
        const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
        if (
          Vec2.distanceSquared(myPosVec, this._patrolTarget) <
          MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
        ) {
          this._patrolTarget = null;
          this._path = null;
        }
      } else if (!this._path) {
        this.setNewPatrolTarget();
      }
      return;
    }

    this.releaseAllKeys();
  }

  /**
   * @description Обобщенный метод для движения по текущему пути `this._path`.
   * @private
   */
  followPath() {
    if (!this._path || this._pathIndex >= this._path.length) {
      return;
    }

    const nextWaypoint = this._path[this._pathIndex];
    this.moveTo(nextWaypoint, true);

    const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
    if (
      Vec2.distanceSquared(myPosVec, nextWaypoint) <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._pathIndex += 1;
    }
  }

  /**
   * @description Ищет ближайшего живого врага.
   * @returns {object | null} - Данные врага или null.
   */
  findClosestEnemy() {
    if (!this._myPosition) return null;
    const myVec = new Vec2(this._myPosition[0], this._myPosition[1]);
    const candidates = this._spatialManager.queryNearby(myVec.x, myVec.y);
    let closestEnemy = null;
    let minDistanceSq = Infinity;
    for (const { gameId, teamId, x, y } of candidates) {
      if (gameId === this._botData.gameId || teamId === this._botData.teamId)
        continue;
      const distanceSq = Vec2.distanceSquared(myVec, new Vec2(x, y));
      if (
        distanceSq < minDistanceSq &&
        distanceSq < MAX_FIRING_DISTANCE * MAX_FIRING_DISTANCE * 1.5
      ) {
        minDistanceSq = distanceSq;
        closestEnemy =
          this._vimp._users[gameId] || this._vimp._bots.getBotById(gameId);
      }
    }
    return closestEnemy;
  }

  /**
   * @description Отпускает все нажатые клавиши управления.
   */
  releaseAllKeys() {
    Object.keys(this._keyStates).forEach(key => this._setKeyState(key, false));
  }

  /**
   * @description Двигает бота к указанной цели.
   * @param {string|Vec2} target - gameId игрока или объект Vec2 с координатами.
   * @param {boolean} [isStaticPoint=false]
   */
  moveTo(target, isStaticPoint = false) {
    if (!this._myBody) return;
    const myPosition = this._myBody.getPosition();
    let targetPosition;
    if (isStaticPoint) {
      targetPosition = target;
    } else {
      const targetPosArray = this._game.getPosition(target);
      if (!targetPosArray) return;
      targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);
      const targetBody = this._game._playersData[target]?.getBody();
      if (targetBody) {
        const targetVelocity = Vec2.clone(targetBody.getLinearVelocity());
        targetPosition.add(targetVelocity.mul(TARGET_PREDICTION_FACTOR));
      }
    }
    const directionToTarget = Vec2.sub(targetPosition, myPosition);
    if (
      directionToTarget.lengthSquared() <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._setKeyState('forward', false);
      this._setKeyState('left', false);
      this._setKeyState('right', false);
      return;
    }
    const dirToTargetNorm = Vec2.clone(directionToTarget);
    dirToTargetNorm.normalize();

    // --- ИЗМЕНЕНИЕ: Возвращаем вызов надежного метода избегания препятствий ---
    const finalDirection = this.avoidObstacles(this._myBody, dirToTargetNorm);

    const forwardVec = this._myBody.getWorldVector(new Vec2(1, 0));
    const angleToTarget = Math.atan2(
      Vec2.cross(forwardVec, finalDirection),
      Vec2.dot(forwardVec, finalDirection),
    );
    const turnThreshold = 0.2;
    if (angleToTarget > turnThreshold) {
      this._setKeyState('right', true);
      this._setKeyState('left', false);
    } else if (angleToTarget < -turnThreshold) {
      this._setKeyState('left', true);
      this._setKeyState('right', false);
    } else {
      this._setKeyState('left', false);
      this._setKeyState('right', false);
    }
    if (Math.abs(angleToTarget) < Math.PI / 1.5) {
      this._setKeyState('forward', true);
    } else {
      this._setKeyState('forward', false);
    }
  }

  /**
   * @description Локальное избегание препятствий с помощью лучей (rayCast).
   * Игнорирует динамические объекты, чтобы таранить их.
   * @param {planck.Body} myBody - Тело бота.
   * @param {planck.Vec2} desiredDirection - Желаемое направление движения.
   * @returns {planck.Vec2} - Скорректированное направление.
   */
  avoidObstacles(myBody, desiredDirection) {
    const myPosition = myBody.getPosition();
    const rays = {
      center: desiredDirection,
      left: Rot.mulVec2(new Rot(Math.PI / 6), desiredDirection),
      right: Rot.mulVec2(new Rot(-Math.PI / 6), desiredDirection),
    };
    const steerCorrection = new Vec2(0, 0);
    let obstaclesDetected = false;
    let dynamicObstacleInPath = false;

    for (const dir in rays) {
      const endPoint = Vec2.add(
        myPosition,
        rays[dir].mul(OBSTACLE_AVOIDANCE_RAY_LENGTH),
      );
      let hit = false;

      this._world.rayCast(myPosition, endPoint, fixture => {
        if (fixture.getBody() !== myBody && !fixture.isSensor()) {
          const hitBody = fixture.getBody();
          const userData = hitBody.getUserData();

          // если это динамический объект карты
          if (userData && userData.type === 'map_object') {
            dynamicObstacleInPath = true;
            return -1; // игнорирование, продолжение луча
          }

          hit = true;
          return 0; // статичное препятствие, окончание луча
        }
        return -1;
      });

      if (hit) {
        obstaclesDetected = true;
        steerCorrection.sub(rays[dir]);
      }
    }

    // если впереди только динамические объекты, не корректируется курс (таран)
    if (dynamicObstacleInPath && !obstaclesDetected) {
      return desiredDirection;
    }

    if (obstaclesDetected) {
      const correctedDir = steerCorrection.add(desiredDirection);
      correctedDir.normalize();
      return correctedDir;
    }

    return desiredDirection;
  }

  /**
   * @description Управляет прицеливанием и стрельбой бота.
   */
  executeAimAndShoot() {
    if (
      this._repositionTimer > 0 ||
      this.state !== 'ATTACKING' ||
      !this._target ||
      !this._game.isAlive(this._target.gameId)
    ) {
      this._setKeyState('gunLeft', false);
      this._setKeyState('gunRight', false);
      return;
    }
    const botTank = this._game._playersData[this._botData.gameId];
    if (!botTank || !this._myBody) return;
    const targetPosArray = this._game.getPosition(this._target.gameId);
    if (!targetPosArray) return;
    const myPosition = this._myBody.getPosition();
    const targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);
    if (!this._vimp._bots.hasLineOfSight(myPosition, targetPosition)) return;
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
    let targetAngle =
      Math.atan2(directionToTarget.y, directionToTarget.x) +
      (Math.random() - 0.5) * AIM_INACCURACY;
    const currentGunAngle = this._myBody.getAngle() + this._myBody.gunRotation;
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
      if (this._firingTimer <= 0) {
        if (
          shouldUseBomb &&
          currentWeapon === 'w2' &&
          this._panel.hasResources(this._botData.gameId, 'w2', 1)
        ) {
          this._game.updateKeys(this._botData.gameId, {
            action: 'down',
            name: 'fire',
          });
          this._bombCooldownTimer = BOMB_COOLDOWN;
          this._repositionTimer = 2.0;
          this.calculateNewCombatPosition();
        } else if (
          !shouldUseBomb &&
          currentWeapon === 'w1' &&
          distanceToTargetSq < MAX_FIRING_DISTANCE * MAX_FIRING_DISTANCE
        ) {
          this._firingTimer =
            MIN_FIRING_DELAY + Math.random() * RANDOM_FIRING_DELAY;
          if (this._panel.hasResources(this._botData.gameId, 'w1', 1)) {
            this._game.updateKeys(this._botData.gameId, {
              action: 'down',
              name: 'fire',
            });
            this._repositionTimer = 2.0;
            this.calculateNewCombatPosition();
          }
        }
      }
    }
  }

  /**
   * @description Обрабатывает ситуацию, когда бот застрял.
   */
  handleClearingObstacle() {
    this.releaseAllKeys();
    if (!this._myBody) {
      this.state = 'IDLE';
      return;
    }
    const currentGunAngle = this._myBody.getAngle() + this._myBody.gunRotation;
    const bodyAngle = this._myBody.getAngle();
    let angleDifference = bodyAngle - currentGunAngle;
    angleDifference = Math.atan2(
      Math.sin(angleDifference),
      Math.cos(angleDifference),
    );
    const aimThreshold = 0.1;
    if (angleDifference > aimThreshold) {
      this._setKeyState('gunRight', true);
    } else if (angleDifference < -aimThreshold) {
      this._setKeyState('gunLeft', true);
    } else {
      this._setKeyState('gunLeft', false);
      this._setKeyState('gunRight', false);
      this._game.updateKeys(this._botData.gameId, {
        action: 'down',
        name: 'fire',
      });
      this._aiUpdateTimer = 0.5;
      this.state = 'PATROLLING';
    }
  }

  /**
   * @description Рассчитывает новую боевую позицию для стрейфа.
   */
  calculateNewCombatPosition() {
    if (!this._myPosition || !this._myBody) return;
    const myPosVec = new Vec2(this._myPosition[0], this._myPosition[1]);
    const rightVec = this._myBody.getWorldVector(new Vec2(0, 1));
    const strafeDirection = Math.random() > 0.5 ? 1 : -1;
    const strafeDistance = 100 + Math.random() * 100;
    this._repositionTarget = Vec2.add(
      myPosVec,
      rightVec.mul(strafeDistance * strafeDirection),
    );
  }

  /**
   * @description Метод очистки при уничтожении бота.
   */
  destroy() {
    this._target = null;
    this.state = 'DEAD';
  }
}

export default BotController;
