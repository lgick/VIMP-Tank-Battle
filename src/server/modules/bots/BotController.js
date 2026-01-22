import { Vec2, Rot } from 'planck';
import { randomRange } from '../../../lib/math.js';

// константы для поведения бота
const AI_UPDATE_INTERVAL = 0.1; // как часто бот принимает решения (в секундах)
const TARGET_PREDICTION_FACTOR = 0.2; // коэффициент для упреждения цели
const OBSTACLE_AVOIDANCE_RAY_LENGTH = 50; // длина лучей для обхода препятствий
const MIN_TARGET_DISTANCE = 30; // минимальная дистанция до цели
const MAX_FIRING_DISTANCE = 500; // максимальная дистанция для ведения огня

// константы для снижения меткости
// максимальная случайная погрешность прицеливания в радианах
// (0.05 радиана ~ 3 градуса)
const AIM_INACCURACY = 0.5;
// минимальная задержка перед выстрелом (в секундах)
const MIN_FIRING_DELAY = 0.5;
// дополнительная случайная задержка
// (итоговая задержка будет от 0.8 до 1.3 секунды)
const RANDOM_FIRING_DELAY = 0.5;

// константы для использования бомб
const BOMB_USAGE_DISTANCE = 100; // дистанция для использования бомбы
const BOMB_COOLDOWN = 0; // перезарядка бомбы в секундах

const REPATH_INTERVAL = 1.0; // частота пересчёта пути (секунды)
const TARGET_SCAN_INTERVAL = 1.5; // интервал поиска новой цели (секунды)

/**
 * @class BotController
 * @description Управляет поведением одного бота:
 * навигацией, прицеливанием, стрельбой и принятием решений.
 */
class BotController {
  /**
   * @param {BotManager} botManager
   * @param {Game} game
   * @param {object} params
   */
  constructor(botManager, game, params) {
    this._botManager = botManager;
    this._game = game;
    this._gameId = params.gameId;
    this._teamId = params.teamId;

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

    this._patrolTarget = null;

    this._keyStates = {
      forward: false,
      back: false,
      left: false,
      right: false,
      gunLeft: false,
      gunRight: false,
    };

    this._position = null;
    this._body = null;
  }

  /**
   * @description Обновляет состояние нажатия клавиш
   * и отправляет команду в игру.
   * @param {string} keyName - Название клавиши.
   * @param {boolean} isDown - true, если клавиша нажата, иначе false.
   * @private
   */
  _setKeyState(keyName, isDown) {
    const action = isDown ? 'down' : 'up';

    if (this._keyStates[keyName]) {
      this._keyStates[keyName] = isDown ? true : false;
    }

    this._game.updateKeys(this._gameId, { action, name: keyName });
  }

  /**
   * @description Кэширует данные о положении и теле бота в начале кадра.
   * @private
   */
  _updateCachedData() {
    try {
      this._position = this._game.getPosition(this._gameId);
      this._body = this._game.getPlayer(this._gameId).getBody();
    } catch (e) {
      this._position = null;
      this._body = null;
    }
  }

  /**
   * @description Главный метод обновления, вызывается в каждом игровом цикле.
   * @param {number} dt - Время, прошедшее с последнего кадра (delta time).
   */
  update(dt) {
    this._updateCachedData();

    if (!this._body || !this._game.isAlive(this._gameId)) {
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
      const currentPosVec = new Vec2(this._position[0], this._position[1]);

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
   * Приоритеты:
   * 1. Атаковать видимого врага.
   * 2. Двигаться к последней позиции врага.
   * 3. Патрулировать.
   */
  makeDecision() {
    if (this._targetScanTimer > 0 && this.state !== 'PATROLLING') {
      return;
    }

    this._targetScanTimer = TARGET_SCAN_INTERVAL;

    if (this._position) {
      this._target = this._botManager.findClosestEnemy(
        this._gameId,
        this._teamId,
        this._position.x,
        this._position.y,
      );
    }

    if (this._target) {
      this._patrolTarget = null;
      this._path = null;
      const targetPos = this._game.getPosition(this._target.gameId);

      if (targetPos) {
        this._lastKnownPosition = new Vec2(targetPos[0], targetPos[1]);

        const isVisible = this._botManager.hasLineOfSight(
          new Vec2(this._position[0], this._position[1]),
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
   * @description Устанавливает новую случайную цель
   * для патрулирования и строит к ней путь.
   * @private
   */
  setNewPatrolTarget() {
    const randomNode = this._botManager.getRandomNavNode();

    if (randomNode && this._position) {
      this._patrolTarget = randomNode;
      const myPosVec = new Vec2(this._position[0], this._position[1]);
      this._path = this._botManager.findPath(myPosVec, this._patrolTarget);
      this._pathIndex = 0;
    }
  }

  /**
   * @description Выполняет логику движения
   * в зависимости от текущего состояния бота.
   */
  executeMovement() {
    if (this._target && !this._game.isAlive(this._target.gameId)) {
      this._target = null;
      this._lastKnownPosition = null;
      this.makeDecision();
      return;
    }

    if (this.state === 'ATTACKING' || this.state === 'NAVIGATING') {
      if (!this._target) {
        return;
      }

      if (this._repositionTimer > 0 && this._repositionTarget) {
        this.moveTo(this._repositionTarget, true);
        const myPosVec = new Vec2(this._position[0], this._position[1]);

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
      const myPosVec = new Vec2(this._position[0], this._position[1]);

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
        const myPosVec = new Vec2(this._position[0], this._position[1]);

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

    const myPosVec = new Vec2(this._position[0], this._position[1]);

    if (
      Vec2.distanceSquared(myPosVec, nextWaypoint) <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._pathIndex += 1;
    }
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
    if (!this._body) {
      return;
    }

    const myPosition = this._body.getPosition();
    let targetPosition;

    if (isStaticPoint) {
      targetPosition = target;
    } else {
      const targetPosArray = this._game.getPosition(target);

      if (!targetPosArray) {
        return;
      }

      targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);
      const targetBody = this._game.getPlayer(target)?.getBody();

      if (targetBody) {
        const targetVelocity = Vec2.clone(targetBody.getLinearVelocity());
        targetPosition.add(targetVelocity.mul(TARGET_PREDICTION_FACTOR));
      }
    }

    const directionToTarget = Vec2.sub(targetPosition, myPosition);

    // если расстояние до цели меньше MIN_TARGET_DISTANCE (бот на месте)
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

    // корректировка курса (объезд препятствий)
    // бот знает идеальное направление к цели (dirToTargetNorm),
    // но он передает этот вектор в метод avoidObstacles:
    // если впереди стена, avoidObstacles вернет вектор,
    // отклоненный в сторону от стены;
    // если чисто — вернет исходный вектор
    const finalDirection = this.avoidObstacles(this._body, dirToTargetNorm);

    const forwardVec = this._body.getWorldVector(new Vec2(1, 0));
    const angleToTarget = Math.atan2(
      Vec2.cross(forwardVec, finalDirection),
      Vec2.dot(forwardVec, finalDirection),
    );

    // мертвая зона (~6 градусов)
    // (чтобы танк не дергался влево-вправо,
    // когда он уже смотрит почти точно на цель)
    const turnThreshold = 0.1;

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

    // если впереди только динамические объекты,
    // не корректируется курс (таран)
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

    const botTank = this._game.getPlayer(this._gameId);

    if (!botTank || !this._body) {
      return;
    }

    const targetPosArray = this._game.getPosition(this._target.gameId);

    if (!targetPosArray) {
      return;
    }

    const myPosition = this._body.getPosition();
    const targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);

    if (!this._botManager.hasLineOfSight(myPosition, targetPosition)) {
      return;
    }

    const directionToTarget = Vec2.sub(targetPosition, myPosition);
    const distanceToTargetSq = directionToTarget.lengthSquared();
    const shouldUseBomb =
      distanceToTargetSq < BOMB_USAGE_DISTANCE * BOMB_USAGE_DISTANCE &&
      this._bombCooldownTimer <= 0;
    const currentWeapon = botTank.currentWeapon;

    if (shouldUseBomb) {
      if (currentWeapon !== 'w2') {
        this._game.updateKeys(this._gameId, {
          action: 'down',
          name: 'nextWeapon',
        });

        return;
      }
    } else if (currentWeapon === 'w2') {
      this._game.updateKeys(this._gameId, {
        action: 'down',
        name: 'nextWeapon',
      });

      return;
    }

    const targetAngle =
      Math.atan2(directionToTarget.y, directionToTarget.x) +
      randomRange(-AIM_INACCURACY / 2, AIM_INACCURACY / 2);

    const currentGunAngle = this._body.getAngle() + this._body.gunRotation;
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
          this._botManager.hasResources(this._gameId, 'w2', 1)
        ) {
          this._setKeyState('fire', true);
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
          if (this._botManager.hasResources(this._gameId, 'w1', 1)) {
            this._setKeyState('fire', true);
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

    if (!this._body) {
      return;
    }

    this._setKeyState('gunCenter', true);
    this._setKeyState('back', true);
    this._aiUpdateTimer = 0.5;
    this.state = 'PATROLLING';
  }

  /**
   * @description Рассчитывает новую боевую позицию для стрейфа.
   */
  calculateNewCombatPosition() {
    if (!this._position || !this._body) {
      return;
    }

    const myPosVec = new Vec2(this._position[0], this._position[1]);
    const rightVec = this._body.getWorldVector(new Vec2(0, 1));
    const strafeDirection = Math.random() > 0.5 ? 1 : -1;
    const strafeDistance = randomRange(100, 200);

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
