import { Container, Ticker } from 'pixi.js';
import TrackMark from './TrackMark.js';

export default class Tracks extends Container {
  constructor(data, assets) {
    super();
    this.zIndex = 1;

    this.currentX = data[0] || 0;
    this.currentY = data[1] || 0;
    this.currentRotation = data[2] || 0;
    this.condition = data[6];
    this._size = data[7];

    // состояние для расчета дельт и ускорений
    this._prevX = this.currentX;
    this._prevY = this.currentY;
    this._prevRotation = this.currentRotation;
    this._prevSpeed = 0; // предыдущая линейная скорость
    this._prevAngularSpeed = 0; // предыдущая угловая скорость

    this._assets = assets;

    // минимальное время (ms), которое должно пройти между созданием двух последовательных "пачек" следов
    // чем меньше значение, тем больше кол-во следов
    // (создаст больше объектов TrackMark, может повлиять на производительность)
    this.trackMarkCooldown = 2;

    // задержка в ms между созданием последовательных "пачек" следов
    this.lastTrackMarkTime = 0;

    // минимальное изменение линейной скорости, чтобы оставить след
    // скорость измеряется в пикселях за время deltaMS последнего тика
    // при уменьшении значения, следы будут появляться чаще при малейшем маневрировании скоростью
    // (легкий разгон, небольшое торможение)
    this.minAbsAccelerationForMark = 4;

    // минимальная текущая угловая скорость для следов при повороте
    // рекомендуемые значения от 0.02 до 0.06
    // при уменьшении: даже медленные или плавные повороты (при условии достаточной линейной скорости)
    // будут оставлять следы
    this.minAngularSpeedForMark = 0.02;

    // минимальное изменение угловой скорости (угловое ускорение)
    // рекомендуемые значения: 0.01 - 1
    // при уменьшении: танк будет оставлять следы даже при небольших изменениях в скорости поворота
    // при увеличении: следы будут появляться только при очень резком начале или очень резком прекращении вращения
    this.minRotationAccelerationForMark = 0.4;

    // минимальная линейная скорость, чтобы поворот оставлял след
    // рекомендемые значения: min: 0, max: 2
    // при уменьшении: танк будет оставлять следы от поворотов даже при вращении на месте
    // при увеличении: танк должен заметно двигаться вперед или назад, чтобы его повороты оставляли следы
    this.minSpeedForRotationMarks = 1.4;

    // визуальные параметры следов

    // ширина одного сегмента следа
    this.trackWidth = this._size * 0.4;

    // длина одного сегмента следа
    this.trackLength = this._size * 0.5;

    const tankHeight = this._size * 3;

    // расстояние от центральной линии танка до центра каждого из двух следов
    this.trackOffset = (tankHeight / 2) * 0.7;

    // смещение назад точки появления следов от центра танка
    this.backwardOffset = tankHeight * 0.4;

    // начальная прозрачность следа (от 0 до 1), когда он только появляется
    this.trackInitialAlpha = 0.4;

    this._tickListener = ticker => this._internalUpdate(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
  }

  update(data) {
    this.currentX = data[0];
    this.currentY = data[1];
    this.currentRotation = data[2];
    this.condition = data[6];
  }

  _internalUpdate(deltaMS) {
    if (deltaMS <= 0) {
      return;
    }

    // обновление всех существующих следов в одном цикле
    // итерация в обратном порядке, чтобы безопасно удалять элементы из массива this.children
    for (let i = this.children.length - 1; i >= 0; i -= 1) {
      const mark = this.children[i];
      // если возвращается true, значит время жизни вышло
      if (mark.update(deltaMS)) {
        // уничтожение спрайта
        // метод destroy() автоматически удаляет объект из родительского контейнера
        mark.destroy();
      }
    }

    // текущие скорости
    const deltaX = this.currentX - this._prevX;
    const deltaY = this.currentY - this._prevY;

    // текущая линейная скорость (пикселей за время deltaMS)
    const currentSpeed = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    let rotationDiff = this.currentRotation - this._prevRotation;

    while (rotationDiff > Math.PI) {
      rotationDiff -= 2 * Math.PI;
    }

    while (rotationDiff < -Math.PI) {
      rotationDiff += 2 * Math.PI;
    }

    // текущая угловая скорость (радианы за время deltaMS)
    const currentAngularSpeed = Math.abs(rotationDiff);

    // линейное ускорение/замедление
    // положительное - ускорение, отрицательное - торможение
    const acceleration = currentSpeed - this._prevSpeed;
    const absAcceleration = Math.abs(acceleration);

    // угловое ускорение/замедление
    const angularAcceleration = currentAngularSpeed - this._prevAngularSpeed;
    const absAngularAcceleration = Math.abs(angularAcceleration);

    const currentTime = performance.now();
    let shouldLeaveMark = false;

    // логика принятия решения об оставлении следа
    if (
      this.condition !== 0 &&
      currentTime - this.lastTrackMarkTime > this.trackMarkCooldown
    ) {
      // если резкое изменение линейной скорости (ускорение или торможение)
      if (absAcceleration > this.minAbsAccelerationForMark) {
        shouldLeaveMark = true;
      }

      // если резкий поворот (высокая текущая угловая скорость ИЛИ высокое угловое ускорение)
      // и при этом есть минимальное движение вперед, чтобы не рисовать следы при вращении на месте.
      if (currentSpeed > this.minSpeedForRotationMarks) {
        if (
          currentAngularSpeed > this.minAngularSpeedForMark ||
          absAngularAcceleration > this.minRotationAccelerationForMark
        ) {
          shouldLeaveMark = true;
        }
      }
    }

    if (shouldLeaveMark) {
      this.createTrackMarksAtPreviousPosition();
      this.lastTrackMarkTime = currentTime;
    }

    // сохранение текущих значений как предыдущих для следующего вызова
    this._prevX = this.currentX;
    this._prevY = this.currentY;
    this._prevRotation = this.currentRotation;
    this._prevSpeed = currentSpeed;
    this._prevAngularSpeed = currentAngularSpeed;
  }

  createTrackMarksAtPreviousPosition() {
    for (let i = -1; i <= 1; i += 2) {
      const sideOffsetX =
        Math.cos(this._prevRotation + Math.PI / 2) * this.trackOffset * i;
      const sideOffsetY =
        Math.sin(this._prevRotation + Math.PI / 2) * this.trackOffset * i;

      const backwardComponentX =
        -Math.cos(this._prevRotation) * this.backwardOffset;
      const backwardComponentY =
        -Math.sin(this._prevRotation) * this.backwardOffset;

      const markX = this._prevX + sideOffsetX + backwardComponentX;
      const markY = this._prevY + sideOffsetY + backwardComponentY;

      const mark = new TrackMark(
        markX,
        markY,
        this._prevRotation,
        this.trackWidth,
        this.trackLength,
        this.trackInitialAlpha,
        this._assets.trackMarkTexture,
      );

      this.addChild(mark);
    }
  }

  _stopTimer() {
    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }
  }

  destroy(options) {
    this._stopTimer();

    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
      ...options,
    });
  }
}
