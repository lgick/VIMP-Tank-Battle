import { describe, it, expect, vi } from 'vitest';

// Pixi замокан: проверяется геометрия холста и набор вариантов, не отрисовка
vi.mock('pixi.js', () => {
  class Graphics {
    constructor() {
      this.filters = null;
      this.strokes = [];
    }

    poly() {
      return this;
    }

    fill() {
      return this;
    }

    stroke(style) {
      this.strokes.push(style);
      return this;
    }

    destroy() {}
  }

  class BlurFilter {
    constructor(options) {
      this.strength = options.strength;
      this.quality = options.quality;
      this.padding = options.strength * 2;
    }
  }

  class Rectangle {
    constructor(x, y, width, height) {
      this.x = x;
      this.y = y;
      this.width = width;
      this.height = height;
    }
  }

  return { Graphics, BlurFilter, Rectangle };
});

const { default: funnelTexture } = await import(
  '../../../../src/client/providers/bakers/funnelTexture.js'
);
const { default: blurMargin } = await import(
  '../../../../src/client/providers/bakers/blurMargin.js'
);

const params = {
  baseRadius: 25,
  irregularity: 4,
  blur: 3,
  numPoints: 20,
  colorFill: 0x1c1c1c,
  colorRim: 0xb0b0b0,
  rimWidth: 4,
  variants: 5,
};

const bake = overrides => {
  const baked = [];
  const renderer = {
    generateTexture: options => {
      baked.push(options);
      return { width: options.frame.width };
    },
  };

  return {
    result: funnelTexture({ ...params, ...overrides }, renderer),
    baked,
  };
};

describe('funnelTexture', () => {
  it('печёт по текстуре на каждый вариант силуэта', () => {
    const { result, baked } = bake();

    expect(result.textures).toHaveLength(5);
    expect(baked).toHaveLength(5);
  });

  it('contentSize описывает силуэт, холст шире на запас под размытие', () => {
    const { result, baked } = bake();

    expect(result.contentSize).toBe((25 + 4 + 4) * 2);
    expect(baked[0].frame.width).toBe(result.contentSize + blurMargin(3) * 2);
  });

  it('padding фильтра равен запасу под размытие', () => {
    const { baked } = bake();

    expect(baked[0].target.filters[0].padding).toBe(blurMargin(3));
  });

  it('нулевое или отсутствующее число вариантов даёт один силуэт', () => {
    expect(bake({ variants: 0 }).result.textures).toHaveLength(1);
    expect(bake({ variants: undefined }).result.textures).toHaveLength(1);
  });

  it('без бортика используется цвет заливки и нулевая толщина', () => {
    const { result, baked } = bake({
      rimWidth: undefined,
      colorRim: undefined,
    });

    expect(baked[0].target.strokes[0]).toEqual({
      width: 0,
      color: params.colorFill,
      alignment: 1,
    });
    expect(result.contentSize).toBe((25 + 4) * 2);
  });
});
