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
  it('run запускает только вспышку, воронки с дымом ещё нет', () => {
    const { controller, stage } = makeController();

    controller.run();

    expect(controller.explosion).not.toBeNull();
    expect(controller.funnel).toBeNull();
    expect(stage.children).toContain(controller.explosion);
  });

  it('пока огонь яркий, воронки нет', () => {
    const { controller } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.2);

    expect(controller.funnel).toBeNull();
  });

  it('воронка с дымом поднимается, когда огонь отгорел', () => {
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

  it('воронка поднимается один раз за взрыв', () => {
    const { controller } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.5);

    const funnel = controller.funnel;

    advanceExplosion(controller.explosion, 0.2);

    expect(controller.funnel).toBe(funnel);
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
    advanceExplosion(controller.explosion, 0.5);

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

  it('без радиуса в данных подставляется эталонный, а не NaN', () => {
    const controller = new ExplosionEffectController([100, 200], assets, {
      soundManager,
    });

    expect(Number.isFinite(controller.radius)).toBe(true);
  });

  it('длинный тик не съедает burnout: воронка поднимается перед концом', () => {
    const { controller } = makeController();

    controller.run();
    // тик перепрыгнул всю вспышку целиком
    advanceExplosion(controller.explosion, 5);

    expect(controller.funnel).not.toBeNull();
  });

  it('очищенная сцена между вспышкой и воронкой уничтожает контроллер', () => {
    const { controller, stage } = makeController();

    controller.run();
    stage.removeChild(controller);
    advanceExplosion(controller.explosion, 0.5);

    expect(controller.funnel).toBeNull();
    expect(controller.destroyed).toBe(true);
    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
  });

  it('размер воронки нормирован по силуэту и следует радиусу взрыва', () => {
    const { controller } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.5);

    // 50 * 0.168 / 66 с разбросом +-15%
    const expected = (50 * 0.168) / assets.funnelTexture.contentSize;
    const scale = controller.funnel._funnel.scaleValue;

    expect(scale).toBeGreaterThan(expected * 0.85);
    expect(scale).toBeLessThan(expected * 1.15);
  });

  it('завершение воронки уничтожает контроллер и снимает звук', () => {
    const { controller } = makeController();

    controller.run();
    advanceExplosion(controller.explosion, 0.5);
    controller.funnel._completeEffect();

    expect(controller.destroyed).toBe(true);
    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
  });
});
