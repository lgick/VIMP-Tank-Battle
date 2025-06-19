import { Container } from 'pixi.js';
import MainExplosionEffect from './MainExplosionEffect.js';
import FunnelEffect from './FunnelEffect.js';

export default class ExplosionEffectController extends Container {
  constructor(data) {
    super();

    // [originX, originY, radius]
    this.originX = data[0];
    this.originY = data[1];
    this.radius = data[2];

    // zIndex контроллера теперь относится только к основной части взрыва
    this.zIndex = 4;
    // Сортировка нужна для корректной работы zIndex основной части взрыва
    this.sortableChildren = true;

    this.mainExplosion = null;
    this.funnel = null;
    this._isDestroyed = false;
  }

  run() {
    if (this._isDestroyed || !this.parent) {
      // Добавлена проверка this.parent, т.к. мы будем его использовать
      if (!this.parent) {
        console.warn(
          'ExplosionEffectController должен быть добавлен на сцену перед вызовом run()',
        );
      }
      return;
    }

    // 1. Создаем воронку
    this.funnel = new FunnelEffect(
      this.originX,
      this.originY,
      this._onFunnelComplete.bind(this),
    );
    // Устанавливаем zIndex, который будет работать на уровне главной сцены
    this.funnel.zIndex = 1; // zIndex для воронки (под игроком)

    // !!! КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: Добавляем воронку не в контроллер, а в родителя контроллера (на главную сцену)
    this.parent.addChild(this.funnel);

    // 2. Создаем основной взрыв
    this.mainExplosion = new MainExplosionEffect(
      this.originX,
      this.originY,
      this.radius,
      this._onMainExplosionComplete.bind(this),
    );
    // zIndex для взрыва не нужен, т.к. он единственный ребенок контроллера с zIndex=4
    // this.mainExplosion.zIndex = 2; // Эта строка теперь не обязательна

    // 3. Добавляем основной взрыв в сам контроллер
    this.addChild(this.mainExplosion);

    // 4. Запускаем оба эффекта
    this.funnel.run();
    this.mainExplosion.run();
  }

  // Основной взрыв завершил свою короткую анимацию
  _onMainExplosionComplete() {
    if (this._isDestroyed) {
      return;
    }

    if (this.mainExplosion) {
      // Контроллер может быть уничтожен после этого, так как видимая часть эффекта пропала
      // но мы ждем завершения воронки
      this.mainExplosion.destroy();
      this.mainExplosion = null;
    }
  }

  // Воронка завершила свой долгий жизненный цикл
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

    // Метод destroy() у mainExplosion и funnel уже содержит логику удаления из родителя,
    // поэтому дополнительно ничего делать не нужно.
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
