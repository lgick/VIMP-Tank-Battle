import { Ticker, Container, Sprite } from 'pixi.js';

export default class MainExplosionEffect extends Container {
  constructor(x, y, radius, onComplete, assets) {
    super();

    // получаем "запеченные" ассеты
    this.particleTexture = assets.explosionParticle;
    this.renderer = assets.renderer;

    this.onComplete = onComplete; // callback по завершению анимации
    this.x = x;
    this.y = y;
    this._radius = radius;

    // сортировка дочерних элементов по zIndex
    this.sortableChildren = true;

    this._durationMS = 3000;
    this._elapsedMS = 0;
    this._isStarted = false;
    this.isComplete = false;

    // необходимый масштаб спрайта, чтобы он соответствовал радиусу взрыва
    // делить на 50, так как базовый радиус в текстуре был 50px
    const desiredScale = this._radius / 50;

    // спрайты
    // основное тело взрыва (голубое)
    this._mainBody = new Sprite(this.particleTexture);
    this._mainBody.anchor.set(0.5);
    this._mainBody.tint = 0xadd8e6; // светло-голубой
    this._mainBody.scale.set(desiredScale);
    this._mainBody.zIndex = 3; // zIndex должен быть выше, чем у воронки

    // коллапсирующее ядро (серое)
    this._core = new Sprite(this.particleTexture);
    this._core.anchor.set(0.5);
    this._core.tint = 0xd3d3d3; // светло-серый
    this._core.scale.set(desiredScale); // начальный размер тот же
    this._core.zIndex = 4; // zIndex ядра должен быть самым высоким

    this.addChild(this._mainBody, this._core);
    this._tickListener = null;
  }

  // запуск анимации взрыва
  run() {
    if (this.isComplete || this._isStarted) {
      return;
    }

    this._isStarted = true;
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  // обновление анимации
  _update(deltaMS) {
    if (this.isComplete) {
      return;
    }

    this._elapsedMS += deltaMS;

    if (this._elapsedMS <= this._durationMS) {
      const progress = this._elapsedMS / this._durationMS;
      this._draw(progress);
    } else {
      this.isComplete = true;

      if (this._tickListener) {
        Ticker.shared.remove(this._tickListener);
        this._tickListener = null;
      }

      this.onComplete();
    }
  }

  // отрисовка
  _draw(progress) {
    const easeInQuad = t => t * t;
    const baseScale = this._radius / 50;

    // анимация основного тела (затухание)
    this._mainBody.alpha = 0.8 * (1 - easeInQuad(progress));

    // анимация ядра (затухание и сжатие)
    const coreProgress = Math.min(1, progress * 1.5);
    this._core.alpha = 1.0 - coreProgress;
    this._core.scale.set(baseScale * (1 - coreProgress));
  }

  // уничтожение объекта
  destroy(options) {
    this.isComplete = true;

    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({
      children: true,
      texture: false, // основную текстуру не требуется удалять, она общая
      baseTexture: false,
      ...options,
    });
  }
}
