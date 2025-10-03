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

    // свойства для обнаружения застревания
    this._stuckTimer = 0;
    this._lastPosition = null;

    // свойства для тактики "стреляй и двигайся"
    this._repositionTimer = 0;
    this._repositionTarget = null;

    this._keyStates = {
      forward: false,
      back: false,
      left: false,
      right: false,
      gunLeft: false,
      gunRight: false,
    };
  }

  /**
   * @description Обновляет состояние нажатия клавиш и
   * отправляет команду в игру.
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
   * @description Главный метод обновления, вызывается в каждом игровом цикле.
   * @param {number} dt - Время, прошедшее с последнего кадра (delta time).
   */
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
    this._repositionTimer = Math.max(0, this._repositionTimer - dt);

    // обнаружение застревания
    this._stuckTimer += dt;
    if (this._stuckTimer >= 1.5) {
      this._stuckTimer = 0;

      const currentPos = this.getBotPosition();

      if (currentPos && this._lastPosition) {
        const posVec = new Vec2(currentPos[0], currentPos[1]);
        const distSq = Vec2.distanceSquared(posVec, this._lastPosition);

        if (
          (this.state === 'NAVIGATING' || this.state === 'SEARCHING') &&
          distSq < 10
        ) {
          console.log(
            `[BOT DEBUG] ${this._botData.gameId}: I am stuck!
             Trying to shoot my way out.
            `,
          );
          this.state = 'CLEARING_OBSTACLE';
        }
      }

      if (currentPos) {
        this._lastPosition = new Vec2(currentPos[0], currentPos[1]);
      }
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
   * Определяет состояние бота (атака, навигация, поиск).
   */
  makeDecision() {
    if (
      this.state === 'CLEARING_OBSTACLE' ||
      this._targetScanTimer > 0 ||
      this._repositionTimer > 0
    ) {
      return;
    }

    this._targetScanTimer = TARGET_SCAN_INTERVAL;
    this._target = this.findClosestEnemy();

    if (this._target) {
      const targetPos = this._game.getPosition(this._target.gameId);

      if (targetPos) {
        this._lastKnownPosition = new Vec2(targetPos[0], targetPos[1]);
      }
    } else {
      if (this.state !== 'SEARCHING' && this._lastKnownPosition) {
        this.state = 'SEARCHING';
      } else {
        this.state = 'IDLE';
      }

      return;
    }

    const targetIsVisible = this.hasLineOfSight(this._target);

    if (targetIsVisible) {
      this.state = 'ATTACKING';
      this._path = null;
    } else {
      this.state = 'NAVIGATING';
    }
  }

  /**
   * @description Ищет ближайшего живого врага.
   * @returns {object | null} - Данные врага или null, если врагов нет.
   */
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

  /**
   * @description Отпускает все нажатые клавиши управления.
   */
  releaseAllKeys() {
    Object.keys(this._keyStates).forEach(key => this._setKeyState(key, false));
  }

  /**
   * @description Выполняет логику движения
   * в зависимости от текущего состояния бота.
   */
  executeMovement() {
    if (!this._target || !this._game.isAlive(this._target.gameId)) {
      this._target = null;
      this.state = 'IDLE';
      this._path = null;
      this.releaseAllKeys();
      return;
    }

    if (this.state === 'ATTACKING' && this._target) {
      if (this._repositionTimer > 0 && this._repositionTarget) {
        this.moveTo(this._repositionTarget, true);
        const myPosArray = this.getBotPosition();
        if (myPosArray) {
          const myPosVec = new Vec2(myPosArray[0], myPosArray[1]);
          if (
            Vec2.distanceSquared(myPosVec, this._repositionTarget) <
            50 * 50
          ) {
            this._repositionTimer = 0;
            this.releaseAllKeys();
          }
        }
        return;
      }

      this.moveTo(this._target.gameId);

      if (!this.hasLineOfSight(this._target)) {
        this.state = 'NAVIGATING';
      }
    } else if (this.state === 'NAVIGATING') {
      this.navigateAlongPath();
    } else if (this.state === 'SEARCHING') {
      this.moveTo(this._lastKnownPosition, true);
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
      this.releaseAllKeys();
    }
  }

  /**
   * @description Двигает бота к указанной цели (игроку или статической точке).
   * @param {string|Vec2} target - gameId игрока или объект Vec2 с координатами.
   * @param {boolean} [isStaticPoint=false] - Флаг, что цель —
   * статическая точка.
   */
  moveTo(target, isStaticPoint = false) {
    const myBody = this._game._playersData[this._botData.gameId]?.getBody();

    if (!myBody) {
      return;
    }

    let targetPosition;
    const myPosition = myBody.getPosition();

    if (isStaticPoint) {
      targetPosition = target;
    } else {
      const targetPosArray = this._game.getPosition(target);

      if (!targetPosArray) {
        return;
      }

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
      // Прекращаем поворот корпуса, когда стоим близко, чтобы избежать вращения.
      this._setKeyState('left', false);
      this._setKeyState('right', false);
      return;
    }

    const dirToTargetNorm = Vec2.clone(directionToTarget);
    dirToTargetNorm.normalize();

    const finalDirection = this.avoidObstacles(myBody, dirToTargetNorm);

    const forwardVec = myBody.getWorldVector(new Vec2(1, 0));
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
   * @description Двигает бота по заранее построенному маршруту (_path).
   * Используется для состояний NAVIGATING и SEARCHING.
   */
  navigateAlongPath() {
    if (!this._target) {
      this.makeDecision();
      return;
    }

    const myPosArray = this.getBotPosition();
    const targetPosArray = this._game.getPosition(this._target.gameId);

    if (!myPosArray || !targetPosArray) {
      return;
    }

    if (this.hasLineOfSight(this._target)) {
      this.state = 'ATTACKING';
      this._path = null;
      return;
    }

    if (this._repathTimer <= 0) {
      this._repathTimer = REPATH_INTERVAL;
      const startVec = new Vec2(myPosArray[0], myPosArray[1]);
      const endVec = new Vec2(targetPosArray[0], targetPosArray[1]);
      const newPath = this._vimp._bots.findPath(startVec, endVec);

      if (newPath && newPath.length > 0) {
        this._path = newPath;
        this._pathIndex = 0;
      } else {
        this.state = 'SEARCHING';
        return;
      }
    }

    if (!this._path || this._pathIndex >= this._path.length) {
      return;
    }

    const nextWaypoint = this._path[this._pathIndex];
    this.moveTo(nextWaypoint, true);

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

  /**
   * @description Локальное избегание препятствий с помощью лучей.
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
   * Выполняется только в состоянии ATTACKING.
   */
  executeAimAndShoot() {
    if (this._repositionTimer > 0) {
      this._setKeyState('gunLeft', false);
      this._setKeyState('gunRight', false);
      return;
    }

    if (
      this.state !== 'ATTACKING' ||
      !this._target ||
      !this._game.isAlive(this._target.gameId)
    ) {
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
            // после выстрела смена позиции
            this._repositionTimer = 2.0;
            this.calculateNewCombatPosition();
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
              // после выстрела смена позиции
              this._repositionTimer = 2.0;
              this.calculateNewCombatPosition();
            }
          }
        }
      }
    }
  }

  /**
   * @description Обрабатывает ситуацию, когда бот застрял.
   * Целится прямо перед собой и стреляет, чтобы расчистить путь.
   */
  handleClearingObstacle() {
    this.releaseAllKeys();
    const myBody = this._game._playersData[this._botData.gameId]?.getBody();
    if (!myBody) {
      this.state = 'IDLE';
      return;
    }

    // цель прямо по курсу танка (башня в 0 градусов относительно корпуса)
    const currentGunAngle = myBody.getAngle() + myBody.gunRotation;
    const bodyAngle = myBody.getAngle();
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

      // башня наведена, выстрел
      this._game.updateKeys(this._botData.gameId, {
        action: 'down',
        name: 'fire',
      });

      this._aiUpdateTimer = 0.5; // задержка перед следующим решением
      this.state = 'NAVIGATING'; // возврат к навигации
    }
  }

  /**
   * @description Рассчитывает новую боевую позицию
   * для стрейфа (движения вбок).
   */
  calculateNewCombatPosition() {
    const myPosArray = this.getBotPosition();

    if (!myPosArray) {
      return;
    }

    const myPosVec = new Vec2(myPosArray[0], myPosArray[1]);
    const body = this._game._playersData[this._botData.gameId]?.getBody();

    if (!body) {
      return;
    }

    const rightVec = body.getWorldVector(new Vec2(0, 1));
    const strafeDirection = Math.random() > 0.5 ? 1 : -1;
    const strafeDistance = 100 + Math.random() * 100; // от 100 до 200

    this._repositionTarget = Vec2.add(
      myPosVec,
      rightVec.mul(strafeDistance * strafeDirection),
    );
  }

  /**
   * @description Проверяет, есть ли прямая видимость до цели,
   * используя raycast.
   * @param {object} target - Данные цели.
   * @returns {boolean} - true, если цель видна, иначе false.
   */
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

  /**
   * @description Безопасно получает текущую позицию бота.
   * @returns {number[] | null} - Массив [x, y] или null в случае ошибки.
   */
  getBotPosition() {
    try {
      return this._game.getPosition(this._botData.gameId);
    } catch (e) {
      return null;
    }
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
