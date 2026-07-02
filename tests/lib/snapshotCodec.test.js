import { describe, it, expect, vi, afterEach } from 'vitest';
import { SnapshotPacker, unpackFrame } from '../../src/lib/snapshotCodec.js';
import { SNAPSHOT_FORMAT_VERSION } from '../../src/config/opcodes.js';

const PORT = 5;

// удобный round-trip: pack → unpack
const roundTrip = (snapshot, camera = 0, serverTime = 0, seq = 0) => {
  const packer = new SnapshotPacker(PORT);

  packer.packBody(snapshot);

  return unpackFrame(packer.packFrame(camera, serverTime, seq));
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('snapshotCodec: заголовок кадра', () => {
  it('port, seq и serverTime переживают round-trip', () => {
    const serverTime = Date.now();
    const frame = roundTrip({}, 0, serverTime, 4242);

    expect(frame.port).toBe(PORT);
    expect(frame.seq).toBe(4242);
    expect(frame.serverTime).toBe(serverTime);
  });

  it('несовпадение версии формата → null', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const packer = new SnapshotPacker(PORT);

    packer.packBody({});

    const buffer = packer.packFrame(0, 0, 1);

    new DataView(buffer).setUint8(1, SNAPSHOT_FORMAT_VERSION + 1);

    expect(unpackFrame(buffer)).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it('пустой снапшот декодируется в пустой объект', () => {
    expect(roundTrip({}).snapshot).toEqual({});
  });
});

describe('snapshotCodec: камера', () => {
  it('camera = 0 (нет камеры) восстанавливается как 0', () => {
    expect(roundTrip({}, 0).camera).toBe(0);
  });

  it('обычные координаты [x, y]', () => {
    expect(roundTrip({}, [105.13, -42.5]).camera).toEqual([105.13, -42.5]);
  });

  it('флаг forceReset (camera[2] = true)', () => {
    const camera = [1, 2];

    camera[2] = true;

    const decoded = roundTrip({}, camera).camera;

    expect(decoded[2]).toBe(true);
  });

  it('строка тряски (camera[3]) — точный round-trip', () => {
    const camera = [0, 0];

    camera[2] = true;
    camera[3] = '0.35:450';

    const decoded = roundTrip({}, camera).camera;

    expect(decoded[2]).toBe(true);
    expect(decoded[3]).toBe('0.35:450');
  });

  it('тряска без forceReset', () => {
    const camera = [7.25, -3];

    camera[3] = '5:300';

    const decoded = roundTrip({}, camera).camera;

    expect(decoded[0]).toBe(7.25);
    expect(decoded[2]).toBeUndefined();
    expect(decoded[3]).toBe('5:300');
  });
});

describe('snapshotCodec: блок танков (m1)', () => {
  it('данные танка восстанавливаются точно', () => {
    const tank = [105.13, -42.5, 1.57, -0.02, 3.25, -1.75, 0.66, 3, 2, 1];
    const { snapshot } = roundTrip({ m1: { 7: tank } });

    expect(snapshot.m1['7']).toEqual(tank);
  });

  it('null-запись (удаление с полотна)', () => {
    const { snapshot } = roundTrip({ m1: { 3: null } });

    expect(snapshot.m1).toEqual({ 3: null });
  });

  it('несколько танков, включая удалённых', () => {
    const t1 = [0, 0, 0, 0, 0, 0, 0, 0, 2, 1];
    const t2 = [-9.99, 8.5, -3.14, 1.5, 0.1, -0.2, 1, 1, 2, 2];
    const { snapshot } = roundTrip({ m1: { 1: t1, 2: t2, 3: null } });

    expect(snapshot.m1['1']).toEqual(t1);
    expect(snapshot.m1['2']).toEqual(t2);
    expect(snapshot.m1['3']).toBeNull();
  });
});

describe('snapshotCodec: блок трассеров (w1)', () => {
  it('пустой массив', () => {
    expect(roundTrip({ w1: [] }).snapshot.w1).toEqual([]);
  });

  it('wasHit восстанавливается как boolean', () => {
    const hit = [1.5, 2.5, 100.1, -200.2, 1.4, 2.4, true];
    const miss = [0, 0, 50, 50, 0, 0, false];
    const { snapshot } = roundTrip({ w1: [hit, miss] });

    expect(snapshot.w1).toEqual([hit, miss]);
    expect(snapshot.w1[0][6]).toBe(true);
    expect(snapshot.w1[1][6]).toBe(false);
  });
});

describe('snapshotCodec: блок бомб (w2)', () => {
  it('base36-ключ (многосимвольный) и данные восстанавливаются', () => {
    const shotId = (46655).toString(36); // 'zzz'
    const bomb = [12.34, -56.78, 0.5, 8, 300];
    const { snapshot } = roundTrip({ w2: { [shotId]: bomb } });

    expect(snapshot.w2[shotId]).toEqual(bomb);
  });

  it('null-запись (бомба взорвалась)', () => {
    const { snapshot } = roundTrip({ w2: { a1: null } });

    expect(snapshot.w2).toEqual({ a1: null });
  });
});

describe('snapshotCodec: блок взрывов (w2e)', () => {
  it('массив [x, y, radius]', () => {
    const list = [
      [10.5, -20.5, 48],
      [0, 0, 100],
    ];

    expect(roundTrip({ w2e: list }).snapshot.w2e).toEqual(list);
  });
});

describe('snapshotCodec: блок динамики карты (c1/c2)', () => {
  it('ключи dN и координаты восстанавливаются', () => {
    const dynamics = {
      d0: [1.25, -2.5, 0.79],
      d7: [-100.01, 200.02, -1.57],
    };

    expect(roundTrip({ c1: dynamics }).snapshot.c1).toEqual(dynamics);
  });

  it('c2 использует ту же раскладку', () => {
    const dynamics = { d1: [5, 6, 7.07] };

    expect(roundTrip({ c2: dynamics }).snapshot.c2).toEqual(dynamics);
  });
});

describe('snapshotCodec: комбинированный снапшот', () => {
  it('все блоки в одном кадре + камера', () => {
    const snapshot = {
      m1: { 1: [1, 2, 0.5, -0.5, 0, 0, 1, 3, 2, 1], 2: null },
      w1: [[0, 0, 10, 10, 0.5, 0.5, true]],
      w2: { 5: [1, 1, 0, 8, 300], 6: null },
      w2e: [[3, 4, 50]],
      c1: { d0: [9, 9, 0] },
    };
    const camera = [77.77, -88.88];
    const frame = roundTrip(snapshot, camera, 1750000000000, 99);

    expect(frame.snapshot).toEqual(snapshot);
    expect(frame.camera).toEqual(camera);
    expect(frame.seq).toBe(99);
  });

  it('packBody один раз — packFrame даёт независимые кадры разным камерам', () => {
    const packer = new SnapshotPacker(PORT);

    packer.packBody({ m1: { 1: [1, 2, 0, 0, 0, 0, 0, 3, 2, 1] } });

    const frameA = unpackFrame(packer.packFrame([10, 20], 1, 1));
    const frameB = unpackFrame(packer.packFrame(0, 1, 1));

    expect(frameA.camera).toEqual([10, 20]);
    expect(frameB.camera).toBe(0);
    expect(frameA.snapshot).toEqual(frameB.snapshot);
  });
});

describe('snapshotCodec: защита от ошибок', () => {
  it('неизвестный ключ снапшота → throw с подсказкой', () => {
    const packer = new SnapshotPacker(PORT);

    expect(() => packer.packBody({ w99: [] })).toThrow(/opcodes\.js/);
  });
});
