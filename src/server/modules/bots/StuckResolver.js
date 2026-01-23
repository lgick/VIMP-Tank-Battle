import { Vec2 } from 'planck';

const STUCK_PHASE_TIME = 0.5; // длительность фазы застревания (сек)
const MIN_MOVE_DELTA = 5; // минимальное смещение (в юнитах мира)
const STUCK_BOMBS_COUNT = 1; // количество бомб в фазе

/**
 * @class StuckResolver
 * @description Управляет логикой выхода бота из состояния застревания.
 * Работает как конечный автомат с фазами:
 * BACKWARD → FORWARD → BOMB_LEFT → BOMB_RIGHT → BACKWARD
 */
export default class StuckResolver {
  constructor(botController) {
    this.bot = botController;

    // BACKWARD | FORWARD | BOMB_LEFT | BOMB_RIGHT
    this.phase = 'BACKWARD';
    this.phaseTimer = 0;

    this.startPos = null;
    this.bombsLeft = 0;
  }

  /**
   * @description Полностью сбрасывает состояние resolver-а.
   * Вызывается, когда бот успешно выбрался.
   */
  reset() {
    this.phase = 'BACKWARD';
    this.phaseTimer = 0;
    this.startPos = null;
    this.bombsLeft = 0;
  }

  /**
   * @description Инициализирует фазу, если resolver только что активирован.
   * Фиксирует стартовую позицию и обнуляет таймер.
   */
  startIfNeeded() {
    if (!this.startPos && this.bot._position) {
      this.startPos = new Vec2(this.bot._position[0], this.bot._position[1]);
      this.phaseTimer = 0;
      this.bombsLeft = STUCK_BOMBS_COUNT;
    }
  }

  /**
   * @description Основной метод обновления stuck-логики.
   * Вызывается каждый тик, пока бот находится в состоянии CLEARING_OBSTACLE.
   * @param {number} dt - delta time (сек)
   * @returns {boolean} true, если бот успешно выбрался
   */
  update(dt) {
    const bot = this.bot;

    if (!bot._body || !bot._position) {
      return false;
    }

    this.startIfNeeded();
    this.phaseTimer += dt;

    bot.releaseAllKeys();
    bot._setKeyState('gunCenter', true);

    // фаза
    switch (this.phase) {
      case 'BACKWARD':
        bot._setKeyState('back', true);
        break;

      case 'FORWARD':
        bot._setKeyState('forward', true);
        break;

      case 'BOMB_LEFT':
        bot._setKeyState('left', true);
        this._handleBombs();
        break;

      case 'BOMB_RIGHT':
        bot._setKeyState('right', true);
        this._handleBombs();
        break;
    }

    if (this.phaseTimer >= STUCK_PHASE_TIME) {
      const moved = this._getMoveDelta();

      if (moved >= MIN_MOVE_DELTA) {
        this.reset();

        return true;
      }

      this._nextPhase();
    }

    return false;
  }

  /**
   * @description Вычисляет, насколько бот сместился
   * от стартовой позиции фазы.
   * @returns {number} дистанция смещения
   * @private
   */
  _getMoveDelta() {
    if (!this.startPos || !this.bot._position) {
      return 0;
    }

    const cur = new Vec2(this.bot._position[0], this.bot._position[1]);

    return Vec2.distance(cur, this.startPos);
  }

  /**
   * @description Переключает stuck-логику на следующую фазу.
   * Сбрасывает таймер, позицию и счётчик бомб.
   * @private
   */
  _nextPhase() {
    this.phaseTimer = 0;
    this.startPos = new Vec2(this.bot._position[0], this.bot._position[1]);
    this.bombsLeft = STUCK_BOMBS_COUNT;

    switch (this.phase) {
      case 'BACKWARD':
        this.phase = 'FORWARD';
        break;
      case 'FORWARD':
        this.phase = 'BOMB_LEFT';
        break;
      case 'BOMB_LEFT':
        this.phase = 'BOMB_RIGHT';
        break;
      case 'BOMB_RIGHT':
        this.phase = 'BACKWARD';
        break;
    }
  }

  /**
   * @description Управляет подрывом бомб
   * в фазах BOMB_LEFT / BOMB_RIGHT.
   * Переключает оружие на w2 и стреляет серией.
   * @private
   */
  _handleBombs() {
    const bot = this.bot;
    const tank = bot._game.getPlayer(bot._gameId);

    if (!tank) {
      return;
    }

    if (tank.currentWeapon !== 'w2') {
      bot._game.updateKeys(bot._gameId, {
        action: 'down',
        name: 'nextWeapon',
      });

      return;
    }

    if (this.bombsLeft > 0 && bot._bombCooldownTimer <= 0) {
      bot._setKeyState('fire', true);
      this.bombsLeft -= 1;
      bot._bombCooldownTimer = 0.2;
    }
  }
}
