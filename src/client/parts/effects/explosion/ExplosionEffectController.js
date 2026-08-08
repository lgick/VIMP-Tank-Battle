import { Container } from 'pixi.js';
import ExplosionEffect from './ExplosionEffect.js';
import FunnelEffect from './FunnelEffect.js';
import { REFERENCE_BLAST_RADIUS } from './SmokeEffect.js';

export default class ExplosionEffectController extends Container {
  constructor(data, assets, dependencies) {
    super();

    this.originX = data[0];
    this.originY = data[1];
    // радиус - единственный источник масштаба для вспышки, воронки и дыма:
    // гард здесь избавляет всех троих от NaN, если сервер его не прислал
    this.radius = data[2] ?? REFERENCE_BLAST_RADIUS;

    this._assets = assets;
    this._soundManager = dependencies.soundManager;

    this.x = this.originX;
    this.y = this.originY;

    this.explosion = null;
    this.funnel = null;
    this._isDestroyed = false;

    this._soundId = this._soundManager.registerSound('explosion', {
      position: {
        x: this.originX,
        y: this.originY,
      },
    });
  }

  run() {
    if (this._isDestroyed) {
      return;
    }

    this.explosion = new ExplosionEffect(
      this.originX,
      this.originY,
      this.radius,
      this._onExplosionBurnout.bind(this),
      this._onExplosionComplete.bind(this),
      this._assets,
    );

    this.explosion.zIndex = 4;
    this.parent.addChild(this.explosion);
    this.parent.sortChildren();

    this.explosion.run();
  }

  // огонь отгорел: воронка с дымом поднимаются, пока вспышка догорает
  _onExplosionBurnout() {
    if (this._isDestroyed) {
      return;
    }

    // сцену очистили между вспышкой и воронкой - ждать больше нечего,
    // а уничтожает контроллер только завершение воронки
    if (!this.parent) {
      this.destroy();
      return;
    }

    this.funnel = new FunnelEffect(
      this.originX,
      this.originY,
      this.radius,
      this._onFunnelComplete.bind(this),
      this._assets,
    );

    this.funnel.zIndex = 2;
    this.parent.addChild(this.funnel);

    // воронка добавляется вне GameView.add - порядок слоёв пересчитывается тут
    this.parent.sortChildren();

    this.funnel.run();
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

    // когда исчезает воронка (она длится дольше взрыва),
    // уничтожение всего контроллера
    this.destroy();
  }

  destroy() {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    if (this._soundId) {
      this._soundManager.unregisterSound(this._soundId);
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

    // текстуры запекаются один раз за сессию и переиспользуются
    // всеми взрывами - уничтожать их нельзя
    super.destroy({
      children: true,
      texture: false,
      baseTexture: false,
    });
  }
}
