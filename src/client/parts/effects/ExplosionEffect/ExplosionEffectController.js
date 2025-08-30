import { Container } from 'pixi.js';
import ExplosionEffect from './ExplosionEffect.js';
import FunnelEffect from './FunnelEffect.js';

export default class ExplosionEffectController extends Container {
  constructor(data, assets, dependencies) {
    super();

    this.originX = data[0];
    this.originY = data[1];
    this.radius = data[2];

    this._assets = assets;

    this._soundManager = dependencies.soundManager;
    this._soundId = null;

    this.x = this.originX;
    this.y = this.originY;

    this.zIndex = 4;
    this.sortableChildren = true;
    this.explosion = null;
    this.funnel = null;
    this._isDestroyed = false;

    this._soundId = this._soundManager.playSpatialOneShot('explosion', {
      x: this.originX,
      y: this.originY,
    });
  }

  run() {
    if (this._isDestroyed) {
      return;
    }

    this.funnel = new FunnelEffect(
      this.originX,
      this.originY,
      this._onFunnelComplete.bind(this),
      this._assets,
    );

    this.funnel.zIndex = 2;
    this.parent.addChild(this.funnel);

    this.explosion = new ExplosionEffect(
      this.originX,
      this.originY,
      this.radius,
      this._onExplosionComplete.bind(this),
      this._assets,
    );

    // взрыв в контроллер
    this.addChild(this.explosion);

    // воронка и взрыв
    this.funnel.run();
    this.explosion.run();
  }

  _onExplosionComplete() {
    if (this._isDestroyed) {
      return;
    }

    if (this.explosion) {
      this.explosion.destroy();
      this.explosion = null;
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

    if (this._soundId) {
      this._soundManager.stopById(this._soundId);
      this._soundId = null;
    }

    if (this.explosion) {
      this.explosion.destroy();
      this.explosion = null;
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
