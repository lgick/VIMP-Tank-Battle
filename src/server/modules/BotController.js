// BotController.js

import { Vec2, Rot } from 'planck';

// Константы для поведения бота
const AI_UPDATE_INTERVAL = 0.2; // как часто бот принимает решения (в секундах)
const HEALTH_THRESHOLD_FOR_COVER = 40; // порог здоровья для поиска укрытия
const TARGET_PREDICTION_FACTOR = 0.2; // коэффициент для упреждения цели
const OBSTACLE_AVOIDANCE_RAY_LENGTH = 150; // длина лучей для обхода препятствий
const MIN_TARGET_DISTANCE = 80; // Минимальная дистанция до цели
const MAX_FIRING_DISTANCE = 500; // Максимальная дистанция для ведения огня

// --- НОВЫЕ КОНСТАНТЫ ДЛЯ СНИЖЕНИЯ МЕТКОСТИ ---
// Максимальная случайная погрешность прицеливания в радианах
// (0.05 радиана ~ 3 градуса)
const AIM_INACCURACY = 0.5;
// Минимальная задержка перед выстрелом (в секундах)
const MIN_FIRING_DELAY = 2;
// Дополнительная случайная задержка
// (итоговая задержка будет от 0.8 до 1.3 секунды)
const RANDOM_FIRING_DELAY = 0.5;

class BotController {
  constructor(vimp, game, panel, botData) {
    this._vimp = vimp;
    this._game = game;
    this._panel = panel;
    this._botData = botData;
    this._world = this._game._world;

    this._target = null;
    this.state = 'IDLE';

    this._aiUpdateTimer = 0;
    this._firingTimer = 0;

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

    if (this._aiUpdateTimer <= 0) {
      this._aiUpdateTimer = AI_UPDATE_INTERVAL;
      this.makeDecision();
    }

    this.executeMovement();
    this.executeAimAndShoot();
  }

  makeDecision() {
    this._target = this.findClosestEnemy();
    const health = this._panel.getCurrentValue(this._botData.gameId, 'health');

    if (!this._target) {
      this.state = 'IDLE';
      return;
    }

    if (health <= HEALTH_THRESHOLD_FOR_COVER && !this.isBehindCover()) {
      this.state = 'SEEKING_COVER';
      return;
    }

    this.state = 'ATTACKING';
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
      ...this._vimp._botManager.getBots(),
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
    }

    if (this.state === 'ATTACKING' && this._target) {
      this.moveTo(this._target.gameId);
    } else if (this.state === 'SEEKING_COVER') {
      this.findAndMoveToCover();
    } else {
      // IDLE
      this._setKeyState('forward', false);
      this._setKeyState('left', false);
      this._setKeyState('right', false);
    }
  }

  moveTo(targetGameId) {
    const myBody = this._game._playersData[this._botData.gameId]?.getBody();

    if (!myBody) {
      return;
    }

    const myPosition = myBody.getPosition();

    const targetPosArray = this._game.getPosition(targetGameId);

    if (!targetPosArray) {
      return;
    }

    const targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);

    const targetBody = this._game._playersData[targetGameId]?.getBody();

    if (targetBody) {
      const targetVelocity = Vec2.clone(targetBody.getLinearVelocity());

      targetPosition.add(targetVelocity.mul(TARGET_PREDICTION_FACTOR));
    }

    const directionToTarget = Vec2.sub(targetPosition, myPosition);

    if (
      directionToTarget.lengthSquared() <
      MIN_TARGET_DISTANCE * MIN_TARGET_DISTANCE
    ) {
      this._setKeyState('forward', false);

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
    if (!this._target || !this._game.isAlive(this._target.gameId)) {
      this._target = null;
      this.state = 'IDLE';
    }

    if (this.state !== 'ATTACKING' || !this._target) {
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

    const targetPosition = new Vec2(targetPosArray[0], targetPosArray[1]);
    const directionToTarget = Vec2.sub(targetPosition, myBody.getPosition());

    // случайная погрешность к цели
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
      const cooldownReady = this._firingTimer <= 0;
      const targetInRange =
        directionToTarget.lengthSquared() <
        MAX_FIRING_DISTANCE * MAX_FIRING_DISTANCE;

      if (targetIsVisible && cooldownReady && targetInRange) {
        // случайная задержка для следующего выстрела
        this._firingTimer =
          MIN_FIRING_DELAY + Math.random() * RANDOM_FIRING_DELAY;

        const weapon = botTank.currentWeapon;

        if (this._panel.hasResources(this._botData.gameId, weapon, 1)) {
          this._game.updateKeys(this._botData.gameId, {
            action: 'down',
            name: 'fire',
          });
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

  findAndMoveToCover() {
    if (this._target) {
      this.moveTo(this._target.gameId);
    }
  }

  destroy() {
    this._target = null;
    this.state = 'DEAD';
  }
}

export default BotController;
