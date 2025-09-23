import AbstractTimer from '../../lib/AbstractTimer.js';

// Singleton TimerManager

let timerManager;

class TimerManager extends AbstractTimer {
  constructor(timers, callbacks) {
    super();

    if (timerManager) {
      return timerManager;
    }

    timerManager = this;

    this._mapTime = timers.mapTime;
    this._roundTime = timers.roundTime;
    this._timeStep = timers.timeStep;
    this._voteTime = timers.voteTime;
    this._timeBlockedVote = timers.timeBlockedVote;
    this._teamChangeGracePeriod = timers.teamChangeGracePeriod;
    this._roundRestartDelay = timers.roundRestartDelay;
    this._mapChangeDelay = timers.mapChangeDelay;
    this._idleCheckInterval = timers.idleCheckInterval;
    this._rttPingInterval = timers.rttPingInterval;

    this._callbacks = callbacks;

    // временные метки для расчетов оставшегося времени
    this._startMapTime = 0;
    this._startRoundTime = 0;

    // переменные для самокорректирующегося игрового цикла
    this._lastShotTime = 0;
    this._expectedTickTime = 0;

    // максимально допустимая дельта времени в секундах,
    // для предотвращения "прыжков" в симуляции после долгих пауз
    this._maxDeltaTime = 0.1;
  }

  // запускает все основные игровые таймеры (карта, игровой цикл, раунд)
  startGameTimers() {
    this.startMapTimer();
    this.startGameLoop();
    this.startRoundTimer();
    this.startRttPingTimer();
  }

  // останавливает все основные игровые таймеры
  stopGameTimers() {
    this.stopGameLoop();
    this.stopRoundTimer();
    this.stopMapTimer();
    this.stopRoundRestartDelay();
    this.stopMapChangeDelay();
    this.stopRttPingTimer();
  }

  // запускает таймер до конца текущей карты
  startMapTimer() {
    this.stopMapTimer();
    this._startMapTime = Date.now();
    this._startTimer('map', this._callbacks.onMapTimeEnd, this._mapTime);
  }

  // останавливает таймер карты
  stopMapTimer() {
    this._stopTimer('map');
  }

  // возвращает оставшееся время до конца карты в миллисекундах
  getMapTimeLeft() {
    const timeLeft = this._mapTime - (Date.now() - this._startMapTime);

    return Math.max(0, timeLeft);
  }

  // запускает таймер до конца текущего раунда
  startRoundTimer() {
    this.stopRoundTimer();
    this._startRoundTime = Date.now();
    this._startTimer('round', this._callbacks.onRoundTimeEnd, this._roundTime);
  }

  // останавливает таймер раунда
  stopRoundTimer() {
    this._stopTimer('round');
  }

  // возвращает оставшееся время до конца раунда в секундах
  getRoundTimeLeft() {
    const timeLeft = this._roundTime - (Date.now() - this._startRoundTime);

    return Math.max(0, Math.floor(timeLeft / 1000));
  }

  // проверяет возможно сменить команду игроку в текущем раунде
  canChangeTeamInCurrentRound() {
    const roundTime = Date.now() - this._startRoundTime;

    return roundTime <= this._teamChangeGracePeriod;
  }

  // логика одного "тика" игрового цикла
  _loopTick() {
    const now = performance.now();
    let dt = (now - this._lastShotTime) / 1000;
    this._lastShotTime = now;

    // если dt аномально большой (система "спала"), ограничить его
    // и сбросить ожидаемое время, чтобы цикл не пытался "наверстать".
    if (dt > this._maxDeltaTime) {
      dt = this._maxDeltaTime;
      this._expectedTickTime = now; // сброс базы для расчета дрейфа
    }

    this._callbacks.onShotTick(dt);

    const drift = now - this._expectedTickTime;
    const nextTimeout = Math.max(0, this._timeStep - drift);
    this._expectedTickTime += this._timeStep;

    // регистрация следующего шага цикла через _startTimer,
    // чтобы его можно было остановить по ключу 'gameLoop'
    this._startTimer('gameLoop', () => this._loopTick(), nextTimeout);
  }

  // инициализирует и запускает игровой цикл (обновление кадров)
  startGameLoop() {
    this.stopGameLoop();

    this._lastShotTime = performance.now();
    this._expectedTickTime = this._lastShotTime + this._timeStep;

    // запуск первого таймаута, который инициирует цикл
    this._startTimer('gameLoop', () => this._loopTick(), this._timeStep);
  }

  // останавливает игровой цикл
  stopGameLoop() {
    this._stopTimer('gameLoop');
  }

  // запускает таймер голосования
  startVoteTimer(onEndCallback) {
    this._startTimer('vote', onEndCallback, this._voteTime);
  }

  // останавливает таймер голосования
  stopVoteTimer() {
    this._stopTimer('vote');
  }

  // запускает таймер, блокирующий возможность инициировать новое голосование
  startVoteBlockTimer(name, onEndCallback) {
    this._startTimer(name, onEndCallback, this._timeBlockedVote);
  }

  // останавливает таймер блокировки голосования
  stopVoteBlockTimer(name) {
    this._stopTimer(name);
  }

  // проверяет наличие блокирующего таймера
  isVoteBlocked(name) {
    return this._hasTimer(name);
  }

  // запускает отложенный перезапуск раунда
  startRoundRestartDelay() {
    this._startTimer(
      'roundRestartDelay',
      this._callbacks.onRoundTimeEnd,
      this._roundRestartDelay,
    );
  }

  // останавливает отложенный перезапуск раунда
  stopRoundRestartDelay() {
    this._stopTimer('roundRestartDelay');
  }

  // запускает отложенную смену карты (после голосования)
  startMapChangeDelay(onEndCallback) {
    this._startTimer('mapChangeDelay', onEndCallback, this._mapChangeDelay);
  }

  // останавливает отложенную смену карты
  stopMapChangeDelay() {
    this._stopTimer('mapChangeDelay');
  }

  // логика одного "тика" для проверки на бездействие
  _idleCheckTick() {
    this._callbacks.onIdleCheck();

    // перезапуск таймера для следующей проверки
    this._startTimer(
      'idleCheck',
      () => this._idleCheckTick(),
      this._idleCheckInterval,
    );
  }

  // запускает периодическую проверку на бездействие
  startIdleCheckTimer() {
    // если есть интервал и callback
    if (this._idleCheckInterval && this._callbacks.onIdleCheck) {
      this.stopIdleCheckTimer();
      this._idleCheckTick();
    }
  }

  // останавливает проверку на бездействие
  stopIdleCheckTimer() {
    this._stopTimer('idleCheck');
  }

  // логика одного "тика" для отправки пингов
  _rttPingTick() {
    this._callbacks.onSendPing();

    // перезапуск таймера для следующего пинга
    this._startTimer(
      'rttPing',
      () => this._rttPingTick(),
      this._rttPingInterval,
    );
  }

  // запускает отправку пингов
  startRttPingTimer() {
    // если есть интервал и callback
    if (this._rttPingInterval && this._callbacks.onSendPing) {
      this.stopRttPingTimer();
      this._rttPingTick();
    }
  }

  // останавливает отправку пингов
  stopRttPingTimer() {
    this._stopTimer('rttPing');
  }
}

export default TimerManager;
