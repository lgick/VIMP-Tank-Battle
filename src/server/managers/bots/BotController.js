import { Vec2, Rot } from 'planck';
import StuckResolver from './StuckResolver.js';
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

const RAY_LEFT = new Rot(Math.PI / 6); // левый луч
const RAY_RIGHT = new Rot(-Math.PI / 6); // правый луч
const RAY_LEFT_WIDE = new Rot(Math.PI / 2.2); // более широкий левый луч
const RAY_RIGHT_WIDE = new Rot(-Math.PI / 2.2); // более широкий правый луч

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

    this._modelData = params.modelData;

    this._world = this._game._world;

    this._target = null;
    this._state = 'PATROLLING';

    // свойства для навигации
    this._path = null;
    this._pathIndex = 0;

    this._repathTimer = Math.random() * REPATH_INTERVAL;
    this._targetScanTimer = Math.random() * TARGET_SCAN_INTERVAL;

    this._aiUpdateTimer = 0;
    this._firingTimer = 0;
    this._bombCooldownTimer = 0;

    this._lastKnownPosition = null;

    // застревания
    this._stuckDetectTimer = 0;
    this._lastPosition = null;
    this._stuckResolver = new StuckResolver(this, game, this._modelData.size);

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

    this.botData = null;
    this.vec2 = null;
    this.body = null;
  }

  /**
   * @description Обновляет состояние нажатия клавиш
   * и отправляет команду в игру.
   * @param {string} keyName - Название клавиши.
   * @param {boolean} isDown - true, если клавиша нажата, иначе false.
   * @private
   */
  setKeyState(keyName, isDown) {
    const action = isDown ? 'down' : 'up';

    if (this._keyStates[keyName]) {
      this._keyStates[keyName] = isDown ? true : false;
    }

    this._game.updateKeys(this._gameId, { action, name: keyName });
  }

  /**
   * @description Главный метод обновления, вызывается в каждом игровом цикле.
   * @param {number} dt - Время, прошедшее с последнего кадра (delta time).
   */
  update(dt) {
    this.botData = this._game.getPlayer(this._gameId);

    this.vec2 = Vec2.clone(this.botData.getPosition());
    this.body = this.botData.getBody();

    this._aiUpdateTimer -= dt;
    this._firingTimer = Math.max(0, this._firingTimer - dt);
    this._bombCooldownTimer = Math.max(0, this._bombCooldownTimer - dt);
    this._repathTimer -= dt;
    this._targetScanTimer -= dt;
    this._repositionTimer = Math.max(0, this._repositionTimer - dt);

    this._stuckDetectTimer += dt;

    if (this._stuckDetectTimer >= 1.5) {
      this._stuckDetectTimer = 0;

      if (this._lastPosition) {
        const distSq = Vec2.distanceSquared(this.vec2, this._lastPosition);

        if (
          distSq < 10 &&
          (this._state === 'NAVIGATING' ||
            this._state === 'SEARCHING' ||
            this._state === 'PATROLLING')
        ) {
          this._state = 'CLEARING_OBSTACLE';
          this._stuckResolver.reset();
        }
      }

      this._lastPosition = this.vec2;
    }

    if (this._state === 'CLEARING_OBSTACLE') {
      const escaped = this._stuckResolver.update(dt);

      if (escaped) {
        this._state = 'PATROLLING';
      }

      return;
    }

    if (this._aiUpdateTimer <= 0) {
      this._aiUpdateTimer = AI_UPDATE_INTERVAL;
      this._makeDecision();
    }

    this._executeMovement();
    this._executeAimAndShoot();
  }

  /**
   * @description Основная логика принятия решений.
   * Приоритеты:
   * 1. Атаковать видимого врага.
   * 2. Двигаться к последней позиции врага.
   * 3. Патрулировать.
   */
  _makeDecision() {
    if (this._state === 'CLEARING_OBSTACLE') {
      return;
    }

    if (this._targetScanTimer > 0 && this._state !== 'PATROLLING') {
      return;
    }

    this._targetScanTimer = TARGET_SCAN_INTERVAL;

    this._target = this._botManager.findClosestEnemy(
      this._gameId,
      this._teamId,
      this.vec2,
    );

    if (this._target) {
      this._lastKnownPosition = this._game.getPosition(this._target.gameId);

      const visible = this._botManager.hasLineOfSight(
        this.vec2,
        this._lastKnownPosition,
      );

      this._state = visible ? 'ATTACKING' : 'NAVIGATING';

      return;
    }

    if (this._lastKnownPosition) {
      this._state = 'SEARCHING';

      return;
    }

    this._state = 'PATROLLING';

    if (!this._patrolTarget) {
      this._setNewPatrolTarget();
    }
  }

  /**
   * @description Устанавливает новую случайную цель
   * для патрулирования и строит к ней путь.
   * @private
   */
  _setNewPatrolTarget() {
    const randomNode = this._botManager.getRandomNavNode();

    if (randomNode) {
      this._patrolTarget = randomNode;
      this._path = this._botManager.findPath(this.vec2, this._patrolTarget);
      this._pathIndex = 0;
    }
  }

  /**
   * @description Выполняет логику движения
   * в зависимости от текущего состояния бота.
   */
  _executeMovement() {
    if (this._state === 'ATTACKING' || this._state === 'NAVIGATING') {
      if (!this._target) {
        return;
      }

      if (this._repositionTimer > 0 && this._repositionTarget) {
        this._moveTo(this._repositionTarget, true);

        if (Vec2.distanceSquared(this.vec2, this._repositionTarget) < 50 * 50) {
          this._repositionTimer = 0;
        }
      } else {
        this._moveTo(this._target.gameId);
      }

      return;
    }

    if (this._state === 'SEARCHING' && this._lastKnownPosition) {
      this._moveTo(this._lastKnownPosition, true);

      if (
        Vec2.distanceSquared(this.vec2, this._lastKnownPosition) <
        MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
      ) {
        this._lastKnownPosition = null;
      }

      return;
    }

    if (this._state === 'PATROLLING') {
      if (this._path && this._patrolTarget) {
        this._followPath();

        if (
          Vec2.distanceSquared(this.vec2, this._patrolTarget) <
          MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
        ) {
          this._patrolTarget = null;
          this._path = null;
        }
      } else if (!this._path) {
        this._setNewPatrolTarget();
      }

      return;
    }

    this.releaseAllKeys();
  }

  /**
   * @description Обобщенный метод для движения по текущему пути `this._path`.
   * @private
   */
  _followPath() {
    if (!this._path || this._pathIndex >= this._path.length) {
      return;
    }

    const nextWaypoint = this._path[this._pathIndex];
    this._moveTo(nextWaypoint, true);

    if (
      Vec2.distanceSquared(this.vec2, nextWaypoint) <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._pathIndex += 1;
    }
  }

  /**
   * @description Отпускает все нажатые клавиши управления.
   */
  releaseAllKeys() {
    Object.keys(this._keyStates).forEach(key => this.setKeyState(key, false));
  }

  /**
   * @description Двигает бота к указанной цели.
   * @param {string|Vec2} target - gameId игрока или объект Vec2 с координатами.
   * @param {boolean} [isStaticPoint=false]
   */
  _moveTo(target, isStaticPoint = false) {
    let targetPosition;

    if (isStaticPoint) {
      targetPosition = target;
    } else {
      targetPosition = this._game.getPosition(target);

      const targetBody = this._game.getPlayer(target).getBody();

      const targetVelocity = Vec2.clone(targetBody.getLinearVelocity());
      targetPosition.add(targetVelocity.mul(TARGET_PREDICTION_FACTOR));
    }

    const directionToTarget = Vec2.sub(targetPosition, this.vec2);

    // если расстояние до цели меньше MIN_TARGET_DISTANCE (бот на месте)
    if (
      directionToTarget.lengthSquared() <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this.setKeyState('forward', false);
      this.setKeyState('left', false);
      this.setKeyState('right', false);
      return;
    }

    const dirToTargetNorm = Vec2.clone(directionToTarget);
    dirToTargetNorm.normalize();

    // корректировка курса (объезд препятствий)
    // бот знает идеальное направление к цели (dirToTargetNorm),
    // но он передает этот вектор в метод _avoidObstacles:
    // если впереди стена, _avoidObstacles вернет вектор,
    // отклоненный в сторону от стены;
    // если чисто — вернет исходный вектор
    const finalDirection = this._avoidObstacles(dirToTargetNorm);

    const forwardVec = this.body.getWorldVector(new Vec2(1, 0));
    const angleToTarget = Math.atan2(
      Vec2.cross(forwardVec, finalDirection),
      Vec2.dot(forwardVec, finalDirection),
    );

    // мертвая зона (~6 градусов)
    // (чтобы танк не дергался влево-вправо,
    // когда он уже смотрит почти точно на цель)
    const turnThreshold = 0.1;

    if (angleToTarget > turnThreshold) {
      this.setKeyState('right', true);
      this.setKeyState('left', false);
    } else if (angleToTarget < -turnThreshold) {
      this.setKeyState('left', true);
      this.setKeyState('right', false);
    } else {
      this.setKeyState('left', false);
      this.setKeyState('right', false);
    }

    if (Math.abs(angleToTarget) < Math.PI / 1.5) {
      this.setKeyState('forward', true);
    } else {
      this.setKeyState('forward', false);
    }
  }

  /**
   * @description Локальное избегание препятствий с помощью лучей (rayCast).
   * Игнорирует динамические объекты, чтобы таранить их.
   * @param {planck.Vec2} desiredDirection - Желаемое направление движения.
   * @returns {planck.Vec2} - Скорректированное направление.
   */
  _avoidObstacles(desiredDirection) {
    const rays = {
      center: desiredDirection,
      left: Rot.mulVec2(RAY_LEFT, desiredDirection),
      right: Rot.mulVec2(RAY_RIGHT, desiredDirection),
      leftWide: Rot.mulVec2(RAY_LEFT_WIDE, desiredDirection),
      rightWide: Rot.mulVec2(RAY_RIGHT_WIDE, desiredDirection),
    };
    const steerCorrection = new Vec2(0, 0);
    let obstaclesDetected = false;
    let dynamicObstacleInPath = false;

    for (const dir in rays) {
      const endPoint = Vec2.add(
        this.vec2,
        rays[dir].mul(OBSTACLE_AVOIDANCE_RAY_LENGTH),
      );
      let hit = false;

      this._world.rayCast(this.vec2, endPoint, fixture => {
        const hitBody = fixture.getBody();

        if (hitBody !== this.body && !fixture.isSensor()) {
          const userData = hitBody.getUserData();

          // если это динамический объект карты
          if (userData && userData.type === 'map_dynamic') {
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
  _executeAimAndShoot() {
    if (this._repositionTimer > 0 || this._state !== 'ATTACKING') {
      this.setKeyState('gunLeft', false);
      this.setKeyState('gunRight', false);
      return;
    }

    const targetPosition = this._game.getPosition(this._target.gameId);

    if (!this._botManager.hasLineOfSight(this.vec2, targetPosition)) {
      return;
    }

    const directionToTarget = Vec2.sub(targetPosition, this.vec2);
    const distanceToTargetSq = directionToTarget.lengthSquared();
    const shouldUseBomb =
      distanceToTargetSq < BOMB_USAGE_DISTANCE * BOMB_USAGE_DISTANCE &&
      this._bombCooldownTimer <= 0;
    const currentWeapon = this.botData.currentWeapon;
    const needWeapon = shouldUseBomb ? 'w2' : 'w1';

    if (currentWeapon !== needWeapon) {
      this.setKeyState('nextWeapon', true);

      return;
    }

    const targetAngle =
      Math.atan2(directionToTarget.y, directionToTarget.x) +
      randomRange(-AIM_INACCURACY / 2, AIM_INACCURACY / 2);

    const currentGunAngle = this.body.getAngle() + this.body.gunRotation;
    let angleDifference = targetAngle - currentGunAngle;
    angleDifference = Math.atan2(
      Math.sin(angleDifference),
      Math.cos(angleDifference),
    );
    const aimThreshold = 0.05;

    if (angleDifference > aimThreshold) {
      this.setKeyState('gunRight', true);
      this.setKeyState('gunLeft', false);
    } else if (angleDifference < -aimThreshold) {
      this.setKeyState('gunLeft', true);
      this.setKeyState('gunRight', false);
    } else {
      this.setKeyState('gunLeft', false);
      this.setKeyState('gunRight', false);

      if (this._firingTimer <= 0) {
        if (
          shouldUseBomb &&
          currentWeapon === 'w2' &&
          this._botManager.hasResources(this._gameId, 'w2', 1)
        ) {
          this.setKeyState('fire', true);
          this._bombCooldownTimer = BOMB_COOLDOWN;
          this._repositionTimer = 2.0;
          this._calculateNewCombatPosition();
        } else if (
          !shouldUseBomb &&
          currentWeapon === 'w1' &&
          distanceToTargetSq < MAX_FIRING_DISTANCE * MAX_FIRING_DISTANCE
        ) {
          this._firingTimer =
            MIN_FIRING_DELAY + Math.random() * RANDOM_FIRING_DELAY;
          if (this._botManager.hasResources(this._gameId, 'w1', 1)) {
            this.setKeyState('fire', true);
            this._repositionTimer = 2.0;
            this._calculateNewCombatPosition();
          }
        }
      }
    }
  }

  /**
   * @description Рассчитывает новую боевую позицию для стрейфа.
   */
  _calculateNewCombatPosition() {
    const rightVec = this.body.getWorldVector(new Vec2(0, 1));
    const strafeDirection = Math.random() > 0.5 ? 1 : -1;
    const strafeDistance = randomRange(100, 200);

    this._repositionTarget = Vec2.add(
      this.vec2,
      rightVec.mul(strafeDistance * strafeDirection),
    );
  }

  /**
   * @description Метод очистки при уничтожении бота.
   */
  destroy() {
    this._target = null;
    this._state = 'DEAD';
  }
}

export default BotController;
