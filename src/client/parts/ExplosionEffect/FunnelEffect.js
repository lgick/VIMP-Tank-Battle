import {
  Graphics,
  Ticker,
  Container,
  BlurFilter,
  Sprite,
  Rectangle,
} from 'pixi.js';
import MainExplosionEffect from './MainExplosionEffect.js';

export default class FunnelEffect extends Container {
  constructor(x, y, onComplete) {
    super();

    // Проверка, был ли вызван статический метод init() в главном классе
    if (!MainExplosionEffect.renderer) {
      throw new Error(
        'FunnelEffect требует инициализации MainExplosionEffect.init(renderer).',
      );
    }

    this.onComplete = onComplete;
    this.x = x;
    this.y = y;

    this._funnelDurationMS = 20000; // длительность жизни воронки
    this._elapsedMS = 0;
    this._isStarted = false;
    this.isComplete = false;

    // Слой 1: Воронка (с уникальной формой)
    this._funnel = this._createFunnelSprite();
    this.addChild(this._funnel);

    this._tickListener = null;
  }

  // Приватный метод для создания спрайта воронки с уникальной формой
  _createFunnelSprite() {
    const graphics = new Graphics();
    // Параметры для генерации "кляксы"
    const baseRadius = 50; // Используем большой радиус для качественной текстуры
    const irregularity = 15; // Степень "неровности" краев
    const blur = 20; // Сила размытия краев
    const numPoints = 12; // Количество вершин для полигона

    // Рассчитываем полный размер холста, чтобы ничего не обрезалось
    const canvasSize = (baseRadius + irregularity + blur) * 2;
    const center = canvasSize / 2;

    // Генерируем точки для неровного многоугольника
    const path = [];
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * Math.PI * 2;
      const r = baseRadius + (Math.random() - 0.5) * 2 * irregularity;
      path.push(center + r * Math.cos(angle), center + r * Math.sin(angle));
    }
    graphics.poly(path).fill(0xffffff);
    graphics.filters = [new BlurFilter({ strength: blur, quality: 10 })];

    // Генерируем текстуру, используя статический рендерер и рассчитанный размер холста
    const funnelTexture = MainExplosionEffect.renderer.generateTexture({
      target: graphics,
      frame: new Rectangle(0, 0, canvasSize, canvasSize),
    });
    graphics.destroy(true);

    const funnelSprite = new Sprite(funnelTexture);
    funnelSprite.anchor.set(0.5);
    funnelSprite.tint = 0x333333;

    // Масштабируем спрайт до целевого размера в 10px.
    // Масштаб = (целевой размер) / (исходный размер формы)
    const scale = 10 / (baseRadius * 2);
    funnelSprite.scale.set(scale);

    return funnelSprite;
  }

  // запуск
  run() {
    if (this.isComplete || this._isStarted) {
      return;
    }
    this._isStarted = true;
    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  // обновление
  _update(deltaMS) {
    if (this.isComplete) {
      return;
    }

    this._elapsedMS += deltaMS;

    // Проверка на завершение жизни воронки
    if (this._elapsedMS >= this._funnelDurationMS) {
      this.isComplete = true;
      if (this._tickListener) {
        Ticker.shared.remove(this._tickListener);
        this._tickListener = null;
      }
      this.onComplete();
    }
  }

  // уничтожение объекта
  destroy(options) {
    this.isComplete = true;

    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    // Уничтожаем уникальную текстуру воронки, чтобы избежать утечек памяти
    if (this._funnel && this._funnel.texture) {
      this._funnel.texture.destroy();
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({ children: true, ...options });
  }
}
