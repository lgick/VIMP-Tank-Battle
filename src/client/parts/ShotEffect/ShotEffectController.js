import { Container } from 'pixi.js';
import TracerEffect from './TracerEffect.js';
import ImpactEffect from './ImpactEffect.js';

export default class ShotEffectController extends Container {
  constructor(data) {
    super();

    this.zIndex = 2;

    this.startPositionX = data[0];
    this.startPositionY = data[1];
    this.endPositionX = data[2];
    this.endPositionY = data[3];
    this.hit = data[4];

    this.tracer = null;
    this.impact = null;
    this._isDestroyed = false; // флаг для предотвращения двойного уничтожения
  }

  run() {
    if (this._isDestroyed) {
      return;
    }

    this.tracer = new TracerEffect(
      this.startPositionX,
      this.startPositionY,
      this.endPositionX,
      this.endPositionY,
      this._onTracerComplete.bind(this), // callback
    );

    this.addChild(this.tracer);
    this.tracer.run();
  }

  // трассер завершил анимацию. Его графика уже должна быть очищена TracerEffect'ом.
  // сам объект TracerEffect будет уничтожен в destroy
  _onTracerComplete() {
    if (this._isDestroyed) {
      return;
    }

    if (this.hit) {
      const dx = this.endPositionX - this.startPositionX;
      const dy = this.endPositionY - this.startPositionY;
      const dist = Math.hypot(dx, dy);
      let impactDirectionX = 0,
        impactDirectionY = 0;

      if (dist > 0.001) {
        impactDirectionX = -(dx / dist);
        impactDirectionY = -(dy / dist);
      }

      this.impact = new ImpactEffect(
        this.endPositionX,
        this.endPositionY,
        impactDirectionX,
        impactDirectionY,
        this._onImpactComplete.bind(this), // callback
      );

      this.addChild(this.impact);

      this.impact.run();

      // иначе, если попадания не было,
      // то после завершения трассера эффект считается завершенным
    } else {
      this.destroy();
    }
  }

  _onImpactComplete() {
    if (this._isDestroyed) {
      return;
    }

    // ImpactEffect завершил свою работу, его флаг isComplete уже должен быть true
    // трассер к этому моменту также должен быть завершен
    // это финальная стадия эффекта, если было попадание
    this.destroy();
  }

  destroy() {
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    // уничтожаем дочерние эффекты, если они существуют
    if (this.tracer) {
      this.tracer.destroy();
      this.tracer = null;
    }

    if (this.impact) {
      this.impact.destroy();
      this.impact = null;
    }

    if (this.parent) {
      this.parent.removeChild(this);
    }

    // children:true уничтожит все, что еще осталось
    super.destroy({ children: true, texture: true, baseTexture: true });
  }
}
