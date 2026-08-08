import { describe, it, expect, vi } from 'vitest';

// Pixi замокан: проверяется геометрия частиц, а не отрисовка
vi.mock('pixi.js', () => {
  class Container {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.rotation = 0;
      this.alpha = 1;
      this.visible = true;
      this.children = [];
      this.parent = null;
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

    destroy() {}
  }

  class Sprite extends Container {
    constructor(texture) {
      super();

      this.texture = texture;
      this.anchor = { set: () => {} };
      this.scaleX = 1;
      this.scaleY = 1;
      this.scale = {
        set: (x, y = x) => {
          this.scaleX = x;
          this.scaleY = y;
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

const { default: SmokeEffect } =
  await import('../../../../src/client/parts/effects/explosion/SmokeEffect.js');

// contentSize - диаметр нарисованного круга, холст шире на запас под размытие
const assets = {
  explosionTexture: { texture: { width: 116 }, contentSize: 100 },
};

const UNIT_SCALE = 1 / assets.explosionTexture.contentSize;
const REFERENCE_RADIUS = 50;

// границы, под которые подобран дым эталонного взрыва (в юнитах мира)
const BASE = {
  minStartSize: 2.1,
  maxStartSize: 5.2,
  minTargetSize: 8.3,
  maxTargetSize: 16.6,
  offset: 15,
  minRiseSpeed: 0.3,
  maxRiseSpeed: 0.7,
};

const makeSmoke = radius => {
  const smoke = new SmokeEffect(assets, radius);

  return {
    smoke,
    blastScale: radius / REFERENCE_RADIUS,
    particles: smoke.children,
  };
};

describe('SmokeEffect: геометрия следует радиусу взрыва', () => {
  it('стартовый залп непустой', () => {
    expect(makeSmoke(REFERENCE_RADIUS).particles.length).toBe(30);
  });

  for (const radius of [REFERENCE_RADIUS, 120, 25]) {
    it(`размеры частиц пропорциональны радиусу ${radius}`, () => {
      const { particles, blastScale } = makeSmoke(radius);

      for (const particle of particles) {
        const { startScale, targetScale } = particle.customData;

        expect(startScale).toBeGreaterThanOrEqual(
          BASE.minStartSize * blastScale * UNIT_SCALE,
        );
        expect(startScale).toBeLessThanOrEqual(
          BASE.maxStartSize * blastScale * UNIT_SCALE,
        );
        expect(targetScale).toBeGreaterThanOrEqual(
          BASE.minTargetSize * blastScale * UNIT_SCALE,
        );
        expect(targetScale).toBeLessThanOrEqual(
          BASE.maxTargetSize * blastScale * UNIT_SCALE,
        );
      }
    });

    it(`разброс спавна и скорость подъёма пропорциональны радиусу ${radius}`, () => {
      const { particles, blastScale } = makeSmoke(radius);

      for (const particle of particles) {
        expect(Math.abs(particle.x)).toBeLessThanOrEqual(
          (BASE.offset * blastScale) / 2,
        );
        expect(Math.abs(particle.y)).toBeLessThanOrEqual(
          (BASE.offset * blastScale) / 2,
        );

        const { vy } = particle.customData;

        expect(-vy).toBeGreaterThanOrEqual(BASE.minRiseSpeed * blastScale);
        expect(-vy).toBeLessThanOrEqual(BASE.maxRiseSpeed * blastScale);
      }
    });
  }

  it('времена жизни от радиуса не зависят: масштабируется только геометрия', () => {
    const reference = makeSmoke(REFERENCE_RADIUS).smoke;
    const bigger = makeSmoke(200).smoke;

    expect(bigger._particleMaxLifeMs).toBe(reference._particleMaxLifeMs);
    expect(bigger._particleSpawnRateMs).toBe(reference._particleSpawnRateMs);
    expect(bigger._startAlpha).toBe(reference._startAlpha);
  });
});
