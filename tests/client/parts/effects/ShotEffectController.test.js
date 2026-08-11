import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pixi замокан: проверяется передача якоря и синхронизация трансформа,
// а не отрисовка (тот же подход, что в ExplosionEffectController.test.js)
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
      this.scale = { set: () => {} };
      this.position = {
        set: (x, y) => {
          this.x = x;
          this.y = y;
        },
      };
      this.visible = true;
    }
  }

  class Graphics extends Container {
    clear() {
      return this;
    }

    circle() {
      return this;
    }

    fill() {
      return this;
    }
  }

  return {
    Container,
    Sprite,
    Graphics,
    Ticker: { shared: { add: vi.fn(), remove: vi.fn() } },
  };
});

const { default: ShotEffectController } = await import(
  '../../../../src/client/parts/effects/shot/ShotEffectController.js'
);
const { default: MapDynamics } = await import(
  '../../../../src/client/MapDynamics.js'
);

const assets = {
  impactParticleTexture: { texture: {}, contentSize: 8 },
};

let soundManager;

beforeEach(() => {
  soundManager = {
    registerSound: vi.fn(() => Symbol('shot')),
    unregisterSound: vi.fn(),
  };
});

// доводит трассер до конца анимации, вызывая _onTracerComplete
const finishTracer = controller => {
  controller.tracer._update(controller.tracer.animationDuration + 1);
};

describe('ShotEffectController: попадание без якоря (стена, промах)', () => {
  it('промах (hit=false): попадание не создаётся', () => {
    const data = [0, 0, 100, 0, 0, 0, false, 1];
    const controller = new ShotEffectController(data, assets, { soundManager });

    controller.run();
    finishTracer(controller);

    expect(controller.impact).toBeNull();
  });

  it('попадание в стену (без 9-го элемента): эффект стоит в мировой точке удара', () => {
    const data = [0, 0, 100, 0, 0, 0, true, 1];
    const controller = new ShotEffectController(data, assets, { soundManager });

    controller.run();
    finishTracer(controller);

    expect(controller.impact).not.toBeNull();
    expect(controller.impact.x).toBe(100);
    expect(controller.impact.y).toBe(0);
  });

  it('якорь есть, но mapDynamics недоступен (спектатор): откат к мировой точке', () => {
    const data = [0, 0, 100, 0, 0, 0, true, 1, ['d0', -5, 0]];
    const controller = new ShotEffectController(data, assets, { soundManager });

    controller.run();
    finishTracer(controller);

    expect(controller.impact.x).toBe(100);
    expect(controller.impact.y).toBe(0);
  });
});

describe('ShotEffectController: попадание в динамику карты (якорь)', () => {
  let mapDynamics;

  beforeEach(() => {
    mapDynamics = new MapDynamics();
    mapDynamics.setMap({
      physicsDynamic: [{ position: [0, 0], angle: 0, width: 20, height: 20 }],
      scale: 1,
    });
    // угол (0,0) + (halfW10,halfH10) → центр (10,10)
  });

  it('осколки появляются в мировой точке удара по ящику', () => {
    // якорь: локальная точка (-10,0) — левая грань ящика (центр (10,10))
    const data = [0, 0, 0, 10, 0, 0, true, 1, ['d0', -10, 0]];
    const controller = new ShotEffectController(data, assets, {
      soundManager,
      mapDynamics,
    });

    controller.run();
    finishTracer(controller);

    expect(controller.impact).not.toBeNull();
    expect(controller.impact.x).toBeCloseTo(0, 6);
    expect(controller.impact.y).toBeCloseTo(10, 6);
  });

  it('точка удара пересчитывается из ТЕКУЩЕГО трансформа ящика (не из момента выстрела)', () => {
    // якорь записан относительно старой позиции ящика (центр (10,10))
    const data = [0, 0, 0, 10, 0, 0, true, 1, ['d0', -10, 0]];
    const controller = new ShotEffectController(data, assets, {
      soundManager,
      mapDynamics,
    });

    controller.run();

    // ящик уехал за время анимации трассера: угол (50,50) → центр (60,60),
    // якорь (-10,0) от центра → точка удара (50,60)
    mapDynamics.update({ c1: { d0: [50, 50, 0] } });

    finishTracer(controller);

    expect(controller.impact.x).toBeCloseTo(50, 6);
    expect(controller.impact.y).toBeCloseTo(60, 6);
  });

  // осколки должны остаться лежать там, где пуля встретила препятствие,
  // и НЕ ехать за ящиком дальше
  it('осколки остаются на месте, когда ящик едет дальше', () => {
    const data = [0, 0, 0, 10, 0, 0, true, 1, ['d0', -10, 0]];
    const controller = new ShotEffectController(data, assets, {
      soundManager,
      mapDynamics,
    });

    controller.run();
    finishTracer(controller);

    const spawnX = controller.impact.x;
    const spawnY = controller.impact.y;

    mapDynamics.update({ c1: { d0: [90, 90, Math.PI / 2] } });
    controller.impact._update(16);

    expect(controller.impact.x).toBe(spawnX);
    expect(controller.impact.y).toBe(spawnY);
  });

  it('ящик исчез (смена карты): откат к точке удара из данных трассера', () => {
    const data = [0, 0, 0, 10, 0, 0, true, 1, ['d0', -10, 0]];
    const controller = new ShotEffectController(data, assets, {
      soundManager,
      mapDynamics,
    });

    controller.run();

    // карта сменилась — getBox('d0') теперь null
    mapDynamics.setMap({ physicsDynamic: [], scale: 1 });

    finishTracer(controller);

    expect(controller.impact.x).toBe(0);
    expect(controller.impact.y).toBe(10);
  });
});
