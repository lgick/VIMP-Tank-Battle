import { describe, it, expect, vi } from 'vitest';
import SoundManager from '../../src/client/SoundManager.js';

// processAudibility использует множество внутренних полей и методов.
// Тестируем через прототип, подставляя минимальный `this` с моками.
// (maxDistance = 1000 → maxDistSquared = 1_000_000; WORLD_VOICE_LIMIT = 30)
const snd = (id, x, priority = 1, opts = {}) => ({
  id,
  position: { x, y: 0 },
  priority,
  loop: opts.loop || false,
  activeSoundId: opts.activeSoundId ?? null,
  volume: 1,
  rate: 1,
});

const makeCtx = sounds => {
  let counter = 0;
  return {
    _registeredSounds: new Map(sounds.map(s => [s.id, s])),
    _listenerX: 0,
    _listenerY: 0,
    _activeInstances: new Map(),
    _internalPlay: vi.fn(() => `play${counter++}`),
    _internalStop: vi.fn(),
    _updateSpatialSound: vi.fn(),
    _cleanupUnplayedOneShots: vi.fn(),
    processAudibility: SoundManager.prototype.processAudibility,
  };
};

describe('SoundManager.processAudibility', () => {
  it('удаляет далёкий одноразовый звук', () => {
    const ctx = makeCtx([snd('a', 2000)]); // дальше maxDistance
    ctx.processAudibility();

    expect(ctx._registeredSounds.has('a')).toBe(false);
    expect(ctx._cleanupUnplayedOneShots).toHaveBeenCalled();
  });

  it('сохраняет далёкий зацикленный звук и проигрывает его', () => {
    const ctx = makeCtx([snd('a', 2000, 1, { loop: true })]);
    ctx.processAudibility();

    expect(ctx._registeredSounds.has('a')).toBe(true);
    expect(ctx._internalPlay).toHaveBeenCalledTimes(1);
  });

  it('проигрывает все слышимые звуки в пределах лимита', () => {
    const ctx = makeCtx([snd('a', 10), snd('b', 20)]);
    ctx.processAudibility();

    expect(ctx._internalPlay).toHaveBeenCalledTimes(2);
    expect(ctx._updateSpatialSound).toHaveBeenCalledTimes(2);
  });

  it('ограничивает число одновременных голосов лимитом (30)', () => {
    const sounds = Array.from({ length: 35 }, (_, i) => snd(`s${i}`, i + 1));
    const ctx = makeCtx(sounds);
    ctx.processAudibility();

    // из 35 кандидатов проигрываются только 30
    expect(ctx._internalPlay).toHaveBeenCalledTimes(30);
  });

  it('останавливает играющий звук, вытесненный из лимита по приоритету', () => {
    const sounds = [
      // 30 громких приоритетных звуков (не играют)
      ...Array.from({ length: 30 }, (_, i) => snd(`hi${i}`, 10, 100)),
      // 1 тихий, уже играющий — должен быть вытеснен
      snd('low', 10, 1, { activeSoundId: 'oldId' }),
    ];
    const ctx = makeCtx(sounds);
    ctx.processAudibility();

    expect(ctx._internalStop).toHaveBeenCalledWith('oldId');
  });

  it('без кандидатов очищает одноразовые звуки', () => {
    const ctx = makeCtx([]);
    ctx.processAudibility();
    expect(ctx._cleanupUnplayedOneShots).toHaveBeenCalled();
  });
});
