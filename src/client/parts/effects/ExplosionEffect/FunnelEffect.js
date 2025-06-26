import { Sprite } from 'pixi.js';
import SmokeEffect from './SmokeEffect.js';
import BaseEffect from '../BaseEffect.js';

// константы для _createFunnelSprite
const FUNNEL_SPRITE_BASE_RADIUS_PX = 50;
const FUNNEL_SPRITE_TARGET_DIAMETER_UNITS = 15;

export default class FunnelEffect extends BaseEffect {
  constructor(x, y, onComplete, assets) {
    super(onComplete);

    this._assets = assets;
    this.x = x;
    this.y = y;
    this.sortableChildren = true;
    this._funnelDurationMS = 20000;
    this._funnelFadeDurationMS = 4000;
    this._elapsedMS = 0;
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
  }

  _createFunnelSprite() {
    const funnelTexture = this._assets.funnelTexture;

    const funnelSprite = new Sprite(funnelTexture);
    funnelSprite.anchor.set(0.5);
    funnelSprite.tint = 0x3a3a3a;

    const scale =
      FUNNEL_SPRITE_TARGET_DIAMETER_UNITS / (FUNNEL_SPRITE_BASE_RADIUS_PX * 2);
    funnelSprite.scale.set(scale);

    return funnelSprite;
  }

  _onEffectStart() {
    // переопределение хука из BaseEffect
    // на случай, если в базовом классе появится логика
    super._onEffectStart();
    if (this._smoke) {
      this._smoke.run();
    }
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
      this._completeEffect(); // метод из BaseEffect
    }
  }

  destroy(options) {
    // уничтожение эффекта перед super.destroy()
    if (this._smoke) {
      this._smoke.destroy();
      this._smoke = null;
    }

    super.destroy(options);
  }
}
