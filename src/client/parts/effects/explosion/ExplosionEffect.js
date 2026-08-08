import { Sprite } from 'pixi.js';
import BaseEffect from '../BaseEffect.js';

// доля анимации, после которой ядро схлопнулось и огонь больше не перебивает
// след от взрыва: с этого момента можно поднимать воронку с дымом
const BURNOUT_PROGRESS = 0.4;

export default class ExplosionEffect extends BaseEffect {
  constructor(x, y, radius, onBurnout, onComplete, assets) {
    super(onComplete); // конструктор BaseEffect

    // ассет взрыва: текстура + диаметр нарисованного круга
    const { texture, contentSize } = assets.explosionTexture;

    this.x = x;
    this.y = y;
    this._radius = radius;

    this.onBurnout = onBurnout;
    this._burnoutFired = false;

    this._durationMs = 1500;
    this._elapsedMs = 0;

    // масштаб нормируется по нарисованному кругу, а не по холсту:
    // запас под размытие не должен влиять на видимый размер
    this._baseScale = (this._radius * 2) / contentSize;

    // спрайты
    // основное тело взрыва (голубое)
    this._mainBody = new Sprite(texture);
    this._mainBody.anchor.set(0.5);
    this._mainBody.tint = 0xadd8e6; // светло-голубой
    this._mainBody.scale.set(this._baseScale);

    // коллапсирующее ядро (серое)
    this._core = new Sprite(texture);
    this._core.anchor.set(0.5);
    this._core.tint = 0xd3d3d3; // светло-серый
    this._core.scale.set(this._baseScale); // начальный размер тот же

    this.addChild(this._mainBody, this._core);
  }

  // обновление анимации
  _update(deltaMs) {
    if (this.isComplete) {
      // проверка из BaseEffect
      return;
    }

    this._elapsedMs += deltaMs;

    if (this._elapsedMs <= this._durationMs) {
      const progress = this._elapsedMs / this._durationMs;
      this._draw(progress);
      this._checkBurnout(progress);
    } else {
      // страховка: burnout обязан сработать до завершения,
      // иначе длинный тик оставит контроллер без воронки навсегда
      this._checkBurnout(1);

      // метод из BaseEffect
      this._completeEffect();
    }
  }

  // одноразовое уведомление о том, что огонь отгорел
  _checkBurnout(progress) {
    if (this._burnoutFired || progress < BURNOUT_PROGRESS) {
      return;
    }

    this._burnoutFired = true;

    if (typeof this.onBurnout === 'function') {
      this.onBurnout();
    }
  }

  // отрисовка
  _draw(progress) {
    const easeInQuad = t => t * t;

    // анимация основного тела (затухание)
    this._mainBody.alpha = 0.6 * (1 - easeInQuad(progress));

    // анимация ядра (затухание и сжатие)
    const coreProgress = Math.min(1, progress * 1.5);
    this._core.alpha = 0.7 - coreProgress;
    this._core.scale.set(this._baseScale * (1 - coreProgress));
  }

  // уничтожение объекта
  destroy(options) {
    // вызов destroy из BaseEffect
    super.destroy(options);
  }
}
