import {
  Graphics,
  Ticker,
  Container,
  BlurFilter,
  Sprite,
  Rectangle,
} from 'pixi.js';
import SmokeEffect from './SmokeEffect.js';

export default class FunnelEffect extends Container {
  constructor(x, y, onComplete, assets) {
    super();

    this._assets = assets;
    this.onComplete = onComplete;
    this.x = x;
    this.y = y;
    this.sortableChildren = true;
    this._funnelDurationMS = 20000;
    this._funnelFadeDurationMS = 4000;
    this._elapsedMS = 0;
    this._isStarted = false;
    this.isComplete = false;
    this._isFading = false;
    this._smokeDurationMS = 4000; // время дыма
    this._smokeSpawningStopped = false;

    this._funnel = this._createFunnelSprite();
    this._funnel.zIndex = 2;
    this.addChild(this._funnel);

    // параметры дыма
    this._smoke = new SmokeEffect(
      {
        spawnRate: 300,
        maxLife: 4000,
        maxScale: 0.06,
        initialAlpha: 0.3,
        stretch: 7,
      },
      this._assets,
    );

    this._smoke.zIndex = 1;
    this.addChild(this._smoke);

    this._tickListener = null;
  }

  _createFunnelSprite() {
    const graphics = new Graphics();
    const baseRadius = 50;
    const irregularity = 15;
    const blur = 20;
    const numPoints = 12;
    const canvasSize = (baseRadius + irregularity + blur) * 2;
    const center = canvasSize / 2;
    const path = [];

    for (let i = 0; i < numPoints; i += 1) {
      const angle = (i / numPoints) * Math.PI * 2;
      const r = baseRadius + (Math.random() - 0.5) * 2 * irregularity;
      path.push(center + r * Math.cos(angle), center + r * Math.sin(angle));
    }

    graphics.poly(path).fill(0xffffff);
    graphics.filters = [new BlurFilter({ strength: blur, quality: 10 })];

    const renderer = this._assets.renderer;

    const funnelTexture = renderer.generateTexture({
      target: graphics,
      frame: new Rectangle(0, 0, canvasSize, canvasSize),
    });

    graphics.destroy(true);

    const funnelSprite = new Sprite(funnelTexture);
    funnelSprite.anchor.set(0.5);
    funnelSprite.tint = 0x3a3a3a;

    // размер воронки
    const scale = 15 / (baseRadius * 2);
    funnelSprite.scale.set(scale);

    return funnelSprite;
  }

  run() {
    if (this.isComplete || this._isStarted) {
      return;
    }

    this._isStarted = true;
    this._smoke.run();

    this._tickListener = ticker => this._update(ticker.deltaMS);
    Ticker.shared.add(this._tickListener);
    this._update(0);
  }

  _update(deltaMS) {
    if (this.isComplete) {
      return;
    }

    this._elapsedMS += deltaMS;

    // если время дыма закончилось
    if (
      !this._smokeSpawningStopped &&
      this._elapsedMS >= this._smokeDurationMS
    ) {
      this._smoke.stopSpawning();
      this._smokeSpawningStopped = true;
    }

    const timeLeft = this._funnelDurationMS - this._elapsedMS;

    if (timeLeft <= this._funnelFadeDurationMS) {
      if (!this._isFading) {
        this._isFading = true;
      }

      const fadeProgress = timeLeft / this._funnelFadeDurationMS;

      this._funnel.alpha = Math.max(0, fadeProgress);
    }

    if (timeLeft <= 0) {
      this.isComplete = true;

      if (this._tickListener) {
        Ticker.shared.remove(this._tickListener);
        this._tickListener = null;
      }

      this.onComplete();
    }
  }

  destroy(options) {
    this.isComplete = true;

    if (this._tickListener) {
      Ticker.shared.remove(this._tickListener);
      this._tickListener = null;
    }

    if (this._funnel && this._funnel.texture) {
      this._funnel.texture.destroy();
    }

    if (this._smoke) {
      this._smoke.destroy();
      this._smoke = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({ children: true, ...options });
  }
}
