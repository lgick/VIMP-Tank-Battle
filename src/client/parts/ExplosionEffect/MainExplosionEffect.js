import {
  Graphics,
  Ticker,
  Container,
  BlurFilter,
  Sprite,
  Rectangle,
} from 'pixi.js';

export default class MainExplosionEffect extends Container {
  // Статическое свойство для хранения "запеченной" текстуры.
  // Оно будет общим для всех экземпляров взрывов.
  static particleTexture = null;
  // Статическое свойство для хранения рендерера
  static renderer = null;

  /**
   * Инициализирует и "запекает" текстуру для эффекта.
   * !! ВАЖНО: Этот метод нужно вызвать один раз при запуске приложения.
   * @param {PIXI.Renderer} renderer - Рендерер вашего Pixi-приложения.
   */
  static init(renderer) {
    if (this.particleTexture) {
      return; // уже инициализировано
    }
    // Сохраняем рендерер для динамической генерации текстур воронок
    this.renderer = renderer;

    const radius = 50; // базовый радиус для текстуры
    const blurStrength = 2; // сила размытия для текстуры

    const graphics = new Graphics();
    // Рисуем белый круг (белый цвет идеально подходит для последующего окрашивания через tint)
    graphics.circle(radius + blurStrength, radius + blurStrength, radius);
    graphics.fill(0xffffff);

    // Применяем фильтр размытия
    graphics.filters = [
      new BlurFilter({ strength: blurStrength, quality: 40 }),
    ];

    // Генерируем текстуру из объекта с фильтром
    this.particleTexture = renderer.generateTexture({
      target: graphics,
      // Область должна включать пространство для размытия
      frame: new Rectangle(
        0,
        0,
        (radius + blurStrength) * 2,
        (radius + blurStrength) * 2,
      ),
    });

    graphics.destroy(true);
  }

  constructor(x, y, radius, onComplete) {
    super();

    // Проверка, был ли вызван статический метод init()
    if (!MainExplosionEffect.particleTexture || !MainExplosionEffect.renderer) {
      throw new Error(
        'MainExplosionEffect не инициализирован. Вызовите MainExplosionEffect.init(renderer) один раз.',
      );
    }

    this.onComplete = onComplete; // callback по завершению анимации
    this.x = x;
    this.y = y;
    this._radius = radius;

    // Включаем сортировку дочерних элементов по zIndex.
    this.sortableChildren = true;

    this._durationMS = 3000;
    this._elapsedMS = 0;
    this._isStarted = false;
    this.isComplete = false;

    // Определяем необходимый масштаб спрайта, чтобы он соответствовал радиусу взрыва.
    // Делим на 50, так как базовый радиус в текстуре был 50px.
    const desiredScale = this._radius / 50;

    // --- Создаем спрайты вместо Graphics ---
    // Слой 2: Основное тело взрыва (голубое)
    this._mainBody = new Sprite(MainExplosionEffect.particleTexture);
    this._mainBody.anchor.set(0.5);
    this._mainBody.tint = 0xadd8e6; // светло-голубой
    this._mainBody.scale.set(desiredScale);
    this._mainBody.zIndex = 3; // zIndex должен быть выше, чем у воронки

    // Слой 3: Коллапсирующее ядро (серое)
    this._core = new Sprite(MainExplosionEffect.particleTexture);
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

  // Отрисовка теперь - это простое и быстрое изменение свойств спрайтов
  _draw(progress) {
    const easeInQuad = t => t * t;
    const baseScale = this._radius / 50;

    // Анимация основного тела (затухание)
    this._mainBody.alpha = 0.8 * (1 - easeInQuad(progress));

    // Анимация ядра (затухание и сжатие)
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
      texture: false, // основную текстуру не удаляем, она общая
      baseTexture: false,
      ...options,
    });
  }
}
