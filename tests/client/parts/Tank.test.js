import { describe, it, expect, vi, beforeEach } from 'vitest';

// Pixi замокан: проверяется звуковая логика танка, а не отрисовка
// (рендеринг parts/** — вне scope unit-тестов, см. TESTING_TODO.md)
vi.mock('pixi.js', () => {
  class Container {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.rotation = 0;
      this.visible = true;
      this.children = [];
      this.destroyed = false;
    }

    addChild(...items) {
      this.children.push(...items);
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
    }
  }

  return { Container, Sprite };
});

const { default: Tank, calculateEngineSoundParams } = await import(
  '../../../src/client/parts/Tank.js'
);

const liveTextures = { body: 'body', gun: 'gun', gunAnchor: { x: 0.2, y: 0.5 } };
const assets = {
  tankTexture: {
    liveTeamId1: liveTextures,
    liveTeamId2: liveTextures,
    destroyed: 'wreck',
  },
};

let soundManager;

// [x, y, rotation, gunRotation, vX, vY, engineLoad, condition, size, teamId]
const makeTank = (over = []) => {
  const data = [10, 20, 0, 0, 0, 0, 0, 100, 10, 1];
  over.forEach(([i, v]) => {
    data[i] = v;
  });

  return new Tank(data, assets, { soundManager });
};

beforeEach(() => {
  soundManager = {
    getSoundConfig: vi.fn(() => ({ volume: 0.3 })),
    registerSound: vi.fn(() => Symbol('tankEngine')),
    updateSoundData: vi.fn(() => true),
    unregisterSound: vi.fn(),
  };
});

describe('calculateEngineSoundParams', () => {
  // timeMs = 0 убирает покачивание питча (sin(0) === 0)
  const at = load => calculateEngineSoundParams(load, 0);

  it('на холостом ходу отдаёт базовую высоту тона и пониженную громкость', () => {
    const { rate, volumeFactor } = at(0);

    expect(rate).toBe(1);
    expect(volumeFactor).toBeLessThan(1);
    expect(volumeFactor).toBeGreaterThan(0);
  });

  it('на полном ходу поднимает и высоту тона, и громкость до максимума', () => {
    const idle = at(0);
    const full = at(1);

    expect(full.rate).toBeGreaterThan(idle.rate);
    expect(full.volumeFactor).toBe(1);
  });

  it('монотонно повышает высоту тона с ростом нагрузки', () => {
    const rates = [0, 0.25, 0.5, 0.75, 1].map(load => at(load).rate);

    rates.forEach((rate, i) => {
      if (i > 0) {
        expect(rate).toBeGreaterThan(rates[i - 1]);
      }
    });
  });

  it('при напряжении (газ в стену) поднимает тон выше полного хода', () => {
    expect(at(1.5).rate).toBeGreaterThan(at(1).rate);
  });

  it('ограничивает громкость на нагрузке свыше 1.0', () => {
    expect(at(3).volumeFactor).toBe(1);
  });

  it('нечисловая нагрузка не даёт NaN', () => {
    const { rate, volumeFactor } = calculateEngineSoundParams(undefined, 0);

    expect(Number.isFinite(rate)).toBe(true);
    expect(Number.isFinite(volumeFactor)).toBe(true);
  });

  it('покачивает высоту тона на холостых и не трогает её на полном ходу', () => {
    const idleWobble = new Set(
      [0, 100, 200, 300].map(t => calculateEngineSoundParams(0, t).rate),
    );
    const fullWobble = new Set(
      [0, 100, 200, 300].map(t => calculateEngineSoundParams(1, t).rate),
    );

    expect(idleWobble.size).toBeGreaterThan(1);
    expect(fullWobble.size).toBe(1);
  });
});

describe('Tank: звук двигателя', () => {
  it('регистрирует луп двигателя при создании живого танка', () => {
    makeTank();

    expect(soundManager.registerSound).toHaveBeenCalledTimes(1);
    expect(soundManager.registerSound.mock.calls[0][0]).toBe('tankEngine');
  });

  it('не регистрирует звук уничтоженному танку', () => {
    makeTank([[7, 0]]);

    expect(soundManager.registerSound).not.toHaveBeenCalled();
  });

  it('_initSounds идемпотентен', () => {
    const tank = makeTank();

    tank._initSounds();
    tank._initSounds();

    expect(soundManager.registerSound).toHaveBeenCalledTimes(1);
  });

  it('снимает регистрацию при уничтожении танка', () => {
    const tank = makeTank();

    tank.update([10, 20, 0, 0, 0, 0, 0, 0, 10, 1]);

    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
    expect(tank._soundId).toBeNull();
  });

  it('перерегистрируется, если регистрация снята reset-ом', () => {
    const tank = makeTank();

    soundManager.updateSoundData.mockReturnValueOnce(false);
    tank.update([11, 21, 0, 0, 0, 0, 0.5, 100, 10, 1]);

    expect(soundManager.registerSound).toHaveBeenCalledTimes(2);
  });

  it('снимает регистрацию при удалении сущности', () => {
    const tank = makeTank();

    tank.destroy();

    expect(soundManager.unregisterSound).toHaveBeenCalledTimes(1);
  });

  it('короткий ряд данных не превращает rate в NaN', () => {
    const tank = makeTank();

    tank.update([11, 21, 0, 0, 0, 0]);

    const [, data] = soundManager.updateSoundData.mock.calls.at(-1);

    expect(Number.isFinite(data.rate)).toBe(true);
    expect(Number.isFinite(data.volume)).toBe(true);
  });
});
