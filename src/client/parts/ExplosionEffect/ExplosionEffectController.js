import { Container } from 'pixi.js';
import MainExplosionEffect from './MainExplosionEffect.js';
import FunnelEffect from './FunnelEffect.js';

export default class ExplosionEffectController extends Container {
  constructor(data) {
    super();

    this.originX = data[0];
    this.originY = data[1];
    this.radius = data[2];

    this.x = this.originX;
    this.y = this.originY;

    this.zIndex = 4;
    this.sortableChildren = true;
    this.mainExplosion = null;
    this.funnel = null;
    this._isDestroyed = false;
  }

  run() {
    if (this._isDestroyed || !this.parent) {
      if (!this.parent) {
        console.warn(
          'ExplosionEffectController должен быть добавлен на сцену перед вызовом run()',
        );
      }

      return;
    }

    this.funnel = new FunnelEffect(
      this.originX,
      this.originY,
      this._onFunnelComplete.bind(this),
    );

    this.funnel.zIndex = 2;
    this.parent.addChild(this.funnel);

    this.mainExplosion = new MainExplosionEffect(
      0,
      0,
      this.radius,
      this._onMainExplosionComplete.bind(this),
    );

    // взрыв в контроллер
    this.addChild(this.mainExplosion);

    // воронка и взрыв
    this.funnel.run();
    this.mainExplosion.run();
  }

  _onMainExplosionComplete() {
    if (this._isDestroyed) {
      return;
    }

    if (this.mainExplosion) {
      this.mainExplosion.destroy();
      this.mainExplosion = null;
    }
  }

  _onFunnelComplete() {
    if (this._isDestroyed) {
      return;
    }

    this.destroy();
  }

  destroy() {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    if (this.mainExplosion) {
      this.mainExplosion.destroy();
      this.mainExplosion = null;
    }

    if (this.funnel) {
      this.funnel.destroy();
      this.funnel = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
