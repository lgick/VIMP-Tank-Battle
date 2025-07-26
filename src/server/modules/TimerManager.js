import AbstractTimer from '../../lib/AbstractTimer.js';

// Singleton TimerManager

let timerManager;

class TimerManager extends AbstractTimer {
  constructor(config, callbacks) {
    super();

    if (timerManager) {
      return timerManager;
    }

    timerManager = this;

    this._mapTime = config.mapTime;
    this._roundTime = config.roundTime;
    this._timeStep = config.timeStep;
    this._voteTime = config.voteTime;
    this._timeBlockedRemap = config.timeBlockedRemap;
    this._teamChangeGracePeriod = config.teamChangeGracePeriod;

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
  }

  // останавливает все основные игровые таймеры
  stopGameTimers() {
    this.stopGameLoop();
    this.stopRoundTimer();
    this.stopMapTimer();
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

    return timeLeft < 0 ? 0 : timeLeft;
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
    let timeLeft = this._roundTime - (Date.now() - this._startRoundTime);

    timeLeft = Math.floor(timeLeft / 1000);

    return timeLeft < 0 ? 0 : timeLeft;
  }

  // проверяет возможно сменить команду игроку в текущем раунде
  canChangeTeamInCurrentRound() {
    const roundTime = Date.now() - this._startRoundTime;

    if (roundTime <= this._teamChangeGracePeriod) {
      return true;
    }

    return false;
  }

  // логика одного "тика" игрового цикла
  _loopTick() {
    const now = Date.now();
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
    const nextTimeout = this._timeStep - drift;
    this._expectedTickTime += this._timeStep;

    // регистрация следующего шага цикла через _startTimer,
    // чтобы его можно было остановить по ключу 'gameLoop'
    this._startTimer(
      'gameLoop',
      () => this._loopTick(),
      Math.max(0, nextTimeout),
    );
  }

  // инициализирует и запускает игровой цикл (обновление кадров)
  startGameLoop() {
    this.stopGameLoop();

    this._lastShotTime = Date.now();
    this._expectedTickTime = Date.now() + this._timeStep;

    // запуск первого таймаута, который инициирует цикл
    this._startTimer('gameLoop', () => this._loopTick(), this._timeStep);
  }

  // останавливает игровой цикл
  stopGameLoop() {
    this._stopTimer('gameLoop');
  }

  // запускает таймер для голосования за смену карты
  startChangeMapTimer(onEndCallback) {
    this._startTimer('changeMap', onEndCallback, this._voteTime);
  }

  // останавливает таймер голосования за смену карты
  stopChangeMapTimer() {
    this._stopTimer('changeMap');
  }

  // запускает таймер, блокирующий возможность инициировать новое голосование
  // в течение некоторого времени после предыдущего
  startBlockedRemapTimer(onEndCallback) {
    this._startTimer('blockedRemap', onEndCallback, this._timeBlockedRemap);
  }

  // останавливает таймер блокировки голосования
  stopBlockedRemapTimer() {
    this._stopTimer('blockedRemap');
  }
}

export default TimerManager;
