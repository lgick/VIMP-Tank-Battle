import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pixi замокан: проверяется порядок запуска эффектов, а не отрисовка
vi.mock('pixi.js', () => {
  class Container {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.rotation = 0;
      this.alpha = 1;
      this.children = [];
      this.parent = null;
      this.destroyed = false;
    }

    addChild(...items) {
      for (const item of items) {
        item.parent = this;
        this.children.push(item);
      }
    }

    sortChildren() {}

    removeChild(item) {
      this.children = this.children.filter(child => child !== item);
      item.parent = null;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  class Sprite extends Container {
    constructor(texture) {
      super();

      this.texture = texture;
      this.anchor = { set: () => {} };
      this.scaleValue = 1;
      this.scale = {
        set: value => {
          this.scaleValue = value;
        },
      };
    }
  }

  return {
    Container,
    Sprite,
    Ticker: { shared: { add: vi.fn(), remove: vi.fn() } },
  };
});

const { Container } = await import('pixi.js');
const { default: ExplosionEffectController } = await import(
  '../../../../src/client/parts/effects/explosion/ExplosionEffectController.js'
);

// contentSize - диаметр нарисованной фигуры (холст шире на запас под размытие)
const assets = {
  funnelTexture: {
    textures: [{ width: 90 }, { width: 90 }],
    contentSize: 66,
  },
  explosionTexture: { texture: { width: 116 }, contentSize: 100 },
};

let soundManager;

// формат серверной строки: [x, y, radius]
const makeController = () => {
  const controller = new ExplosionEffectController([100, 200, 50], assets, {
    soundManager,
  });
  const stage = new Container();

  stage.addChild(controller);

  return { controller, stage };
};

beforeEach(() => {
  soundManager = {
    registerSound: vi.fn(() => Symbol('explosion')),
    unregisterSound: vi.fn(),
  };
});

// прокрутка вспышки до доли её длительности
const advanceExplosion = (explosion, progress) =>
  explosion._update(explosion._durationMs * progress);

describe('ExplosionEffectController: порядок эффектов', () => {
  it('run поднимает вспышку и воронку с дымом сразу', () => {
    const { controller, stage } = makeController();

    controller.run();

    expect(controller.explosion).not.toBeNull();
    expect(controller.funnel).not.toBeNull();
    expect(stage.children).toContain(controller.explosion);
    expect(stage.children).toContain(controller.funnel);
  });

  it('воронка с дымом живёт, пока вспышка догорает', () => {
    const { controller, stage } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.5);

    expect(controller.funnel).not.toBeNull();
    expect(controller.funnel._isStarted).toBe(true);
    expect(stage.children).toContain(controller.funnel);

    // вспышка ещё догорает
    expect(controller.explosion).not.toBeNull();
    expect(controller.explosion.destroyed).toBe(false);
  });

  it('повторный run не поднимает вторую пару эффектов', () => {
    const { controller, stage } = makeController();

    controller.run();

    const explosion = controller.explosion;
    const funnel = controller.funnel;

    controller.run();

    expect(controller.explosion).toBe(explosion);
    expect(controller.funnel).toBe(funnel);

    // контроллер + вспышка + воронка, без осиротевшего дубля
    expect(stage.children).toHaveLength(3);
  });

  it('завершение вспышки уничтожает её, воронка живёт дальше', () => {
    const { controller } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.5);

    const explosion = controller.explosion;
    const funnel = controller.funnel;

    explosion._completeEffect();

    expect(explosion.destroyed).toBe(true);
    expect(controller.explosion).toBeNull();
    expect(controller.funnel).toBe(funnel);
    expect(funnel.destroyed).toBe(false);
  });

  it('воронка проступает не мгновенно, а за время проявления', () => {
    const { controller } = makeController();

    controller.run();

    const funnel = controller.funnel;
    const fadeInMs = funnel._funnelFadeInDurationMs;

    expect(funnel._funnel.alpha).toBe(0);

    funnel._update(fadeInMs / 2);
    const halfAlpha = funnel._funnel.alpha;

    funnel._update(fadeInMs / 2);
    const fullAlpha = funnel._funnel.alpha;

    expect(halfAlpha).toBeGreaterThan(0);
    expect(fullAlpha).toBeGreaterThan(halfAlpha);

    // дальше альфа не растёт
    funnel._update(1000);
    expect(funnel._funnel.alpha).toBeCloseTo(fullAlpha, 5);
  });

  it('нулевое проявление показывает воронку сразу, а не гасит её в NaN', () => {
    const { controller } = makeController();

    controller.run();

    const funnel = controller.funnel;

    funnel._funnelFadeInDurationMs = 0;

    // без защиты это 0/0 на стартовом кадре: alpha уходит в NaN
    // и воронка молча не рисуется всю свою жизнь
    funnel._update(0);

    expect(Number.isNaN(funnel._funnel.alpha)).toBe(false);
    expect(funnel._funnel.alpha).toBeGreaterThan(0);
  });

  it('без радиуса в данных подставляется эталонный, а не NaN', () => {
    const controller = new ExplosionEffectController([100, 200], assets, {
      soundManager,
    });

    expect(Number.isFinite(controller.radius)).toBe(true);
  });

  it('длинный тик, перепрыгнувший вспышку, не трогает воронку', () => {
    const { controller } = makeController();

    controller.run();

    const funnel = controller.funnel;

    // тик перепрыгнул всю вспышку целиком
    advanceExplosion(controller.explosion, 5);

    expect(controller.explosion).toBeNull();
    expect(controller.funnel).toBe(funnel);
    expect(funnel.destroyed).toBe(false);
  });

  // страховка: уничтожает контроллер только завершение воронки, поэтому
  // на очищенной сцене, где воронку поднять негде, он обязан убрать себя сам -
  // иначе звук, снятый с регистрации только в destroy, останется висеть
  it('run на очищенной сцене уничтожает контроллер и снимает звук', () => {
    const { controller, stage } = makeController();

    stage.removeChild(controller);
    controller.run();

    expect(controller.explosion).toBeNull();
    expect(controller.funnel).toBeNull();
    expect(controller.destroyed).toBe(true);
    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
  });

  it('размер воронки нормирован по силуэту и следует радиусу взрыва', () => {
    const { controller } = makeController();

    controller.run();

    // 50 * 0.168 / 66 с разбросом +-15%
    const expected = (50 * 0.168) / assets.funnelTexture.contentSize;
    const scale = controller.funnel._funnel.scaleValue;

    expect(scale).toBeGreaterThan(expected * 0.85);
    expect(scale).toBeLessThan(expected * 1.15);
  });

  it('завершение воронки уничтожает контроллер и снимает звук', () => {
    const { controller } = makeController();

    controller.run();
    controller.funnel._completeEffect();

    expect(controller.destroyed).toBe(true);
    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
  });
});
