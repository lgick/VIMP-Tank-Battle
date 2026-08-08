import { Sprite } from 'pixi.js';
import { clamp, randomRange } from '../../../../lib/math.js';
import SmokeEffect from './SmokeEffect.js';
import BaseEffect from '../BaseEffect.js';

// константы для _createFunnelSprite
// размер всего спрайта (воронка вместе с бортиком и размытием) в игровых юнитах
// при изменении blur в конфиге запас под размытие растёт - пересчитать
const FUNNEL_DIAMETER_UNITS = 11.5;
// базовая прозрачность: след едва читается и не спорит с игровыми объектами
const FUNNEL_BASE_ALPHA = 0.225;
// разброс размера воронок относительно базового
const FUNNEL_SIZE_JITTER = 0.15;

export default class FunnelEffect extends BaseEffect {
  constructor(x, y, onComplete, assets) {
    super(onComplete);

    this._assets = assets;
    this.x = x;
    this.y = y;
    this._funnelDurationMs = 20000;
    this._funnelFadeInDurationMs = 400; // проявление
    this._funnelFadeDurationMs = 4000; // затухание
    this._elapsedMs = 0;
    this._smokeDurationMs = 4000; // время дыма
    this._smokeSpawningStopped = false;

    this._funnel = this._createFunnelSprite();
    this._smoke = new SmokeEffect(this._assets);

    this.addChild(this._funnel, this._smoke);
  }

  _createFunnelSprite() {
    // ассет - набор силуэтов, воронка берёт случайный
    const variants = this._assets.funnelTexture;
    const texture = variants[Math.floor(Math.random() * variants.length)];

    // текстура уже двухтоновая, tint не применяется
    const funnelSprite = new Sprite(texture);
    funnelSprite.anchor.set(0.5);
    funnelSprite.alpha = 0; // проявляется в _update

    // поворот и разброс размера, чтобы воронки не повторялись
    funnelSprite.rotation = Math.random() * Math.PI * 2;

    const size =
      FUNNEL_DIAMETER_UNITS *
      randomRange(1 - FUNNEL_SIZE_JITTER, 1 + FUNNEL_SIZE_JITTER);

    // масштаб от фактического размера текстуры:
    // в неё входит прозрачный запас под размытие
    funnelSprite.scale.set(size / texture.width);

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

  _update(deltaMs) {
    if (this.isComplete) {
      return;
    }

    this._elapsedMs += deltaMs;

    // если время дыма закончилось
    if (
      !this._smokeSpawningStopped &&
      this._elapsedMs >= this._smokeDurationMs
    ) {
      this._smoke.stopSpawning();
      this._smokeSpawningStopped = true;
    }

    const timeLeft = this._funnelDurationMs - this._elapsedMs;

    // воронка проступает после взрыва и затухает к концу жизни
    const fadeIn = this._elapsedMs / this._funnelFadeInDurationMs;
    const fadeOut = timeLeft / this._funnelFadeDurationMs;

    this._funnel.alpha =
      FUNNEL_BASE_ALPHA * clamp(Math.min(fadeIn, fadeOut), 0, 1);

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

    this._funnel = null;

    super.destroy(options);
  }
}
