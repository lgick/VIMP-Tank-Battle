import { Vec2 } from 'planck';

const STUCK_PHASE_TIME = 0.5; // длительность фазы застревания (сек)
const STUCK_EXIT_RADIUS_FACTOR = 2; // коэффициент смещения танка

/**
 * @class StuckResolver
 * @description Управляет логикой выхода бота из состояния застревания.
 * Работает как конечный автомат с фазами:
 * BACKWARD → FORWARD → BOMB_LEFT → BOMB_RIGHT → BACKWARD
 */
export default class StuckResolver {
  constructor(botController, game, size) {
    this._botController = botController;
    this._game = game;

    const halfWidth = size * 4 * 0.5;
    const halfHeight = size * 3 * 0.5;
    const radius = Math.sqrt(halfWidth * halfWidth + halfHeight * halfHeight);

    // минимальное смещение танка для выхода из stuck
    this._minMoveDelta = radius * STUCK_EXIT_RADIUS_FACTOR;

    // BACKWARD | FORWARD | BOMB_LEFT | BOMB_RIGHT
    this._phase = 'BACKWARD';
    this._phaseTimer = 0;
    this._startPos = null;
    this._canUseBomb = false;
  }

  /**
   * @description Полностью сбрасывает состояние resolver-а.
   * Вызывается, когда бот успешно выбрался.
   */
  reset() {
    this._phase = 'BACKWARD';
    this._phaseTimer = 0;
    this._startPos = null;
    this._canUseBomb = false;
  }

  /**
   * @description Основной метод обновления stuck-логики.
   * Вызывается каждый тик, пока бот находится в состоянии CLEARING_OBSTACLE.
   * @param {number} dt - delta time (сек)
   * @returns {boolean} true, если бот успешно выбрался и false,
   * если stuck-логика продолжается
   */
  update(dt) {
    if (!this._startPos) {
      this._startPos = Vec2.clone(this._botController.vec2);

      this._phaseTimer = 0;
      this._canUseBomb = true;
    }

    this._phaseTimer += dt;

    this._botController.releaseAllKeys();
    this._botController.setKeyState('gunCenter', true);

    // фаза
    switch (this._phase) {
      case 'BACKWARD':
        this._botController.setKeyState('back', true);
        break;

      case 'FORWARD':
        this._botController.setKeyState('forward', true);
        break;

      case 'BOMB_LEFT':
        this._botController.setKeyState('left', true);
        this._handleBombs();
        break;

      case 'BOMB_RIGHT':
        this._botController.setKeyState('right', true);
        this._handleBombs();
        break;
    }

    if (this._phaseTimer >= STUCK_PHASE_TIME) {
      const moved = Vec2.distance(this._botController.vec2, this._startPos);

      if (moved >= this._minMoveDelta) {
        this.reset();

        return true;
      }

      this._nextPhase();
    }

    return false;
  }

  /**
   * @description Переключает stuck-логику на следующую фазу.
   * Сбрасывает таймер, позицию и счётчик бомб.
   * @private
   */
  _nextPhase() {
    this._phaseTimer = 0;
    this._startPos = Vec2.clone(this._botController.vec2);
    this._canUseBomb = true;

    switch (this._phase) {
      case 'BACKWARD':
        this._phase = 'FORWARD';
        break;
      case 'FORWARD':
        this._phase = 'BOMB_LEFT';
        break;
      case 'BOMB_LEFT':
        this._phase = 'BOMB_RIGHT';
        break;
      case 'BOMB_RIGHT':
        this._phase = 'BACKWARD';
        break;
    }
  }

  /**
   * @description Управляет подрывом бомб
   * в фазах BOMB_LEFT / BOMB_RIGHT.
   * Переключает оружие на w2 и стреляет.
   * @private
   */
  _handleBombs() {
    if (this._canUseBomb === false) {
      return;
    }

    const botData = this._botController.botData;

    if (botData.currentWeapon !== 'w2') {
      this._botController.setKeyState('nextWeapon', true);

      return;
    }

    this._botController.setKeyState('fire', true);
    this._canUseBomb = false;
  }
}
