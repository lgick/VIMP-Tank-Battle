import { describe, it, expect, beforeEach } from 'vitest';
import ShotPredictor from '../../src/client/ShotPredictor.js';

// логика гейта/спавна/подавления дублей; raycast-примитивы покрыты
// в tests/lib/raycast.test.js

const models = {
  m1: {
    size: 16, // width = 64, height = 48 (как серверный Tank)
    currentWeapon: 'w1',
  },
};

const weapons = {
  w1: {
    type: 'hitscan',
    range: 1000,
    fireRate: 0.5,
    spread: 0,
    consumption: 1,
  },
  w2: {
    type: 'explosive',
    size: 8,
    time: 300,
    fireRate: 0.1,
  },
};

// состояние танка в начале координат, стволом вправо
const restingState = () => ({
  x: 0,
  y: 0,
  angle: 0,
  gunRotation: 0,
});

// карта 3×3 без стен
const emptyMap = () => ({
  map: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  step: 32,
  scale: 2,
  physicsStatic: [1],
  physicsDynamic: [],
});

const makePredictor = () => {
  const p = new ShotPredictor({ models, weapons });

  p.setModel('m1');
  p.setMap(emptyMap());

  return p;
};

let predictor;

beforeEach(() => {
  predictor = makePredictor();
});

describe('ShotPredictor: гейт выстрела', () => {
  it('без модели или gameId не стреляет', () => {
    const bare = new ShotPredictor({ models, weapons });

    expect(bare.tryFire(restingState(), 1, 0)).toBeNull();
    expect(predictor.tryFire(restingState(), null, 0)).toBeNull();
    expect(predictor.tryFire(null, 1, 0)).toBeNull();
  });

  it('кулдаун блокирует повторный выстрел, после кулдауна — снова можно', () => {
    expect(predictor.tryFire(restingState(), 1, 0)).not.toBeNull();
    // fireRate w1 = 0.5с
    expect(predictor.tryFire(restingState(), 1, 400)).toBeNull();
    expect(predictor.tryFire(restingState(), 1, 501)).not.toBeNull();
  });

  it('патроны из панели: 0 блокирует, неизвестное количество — нет', () => {
    predictor.syncPanel(['w1:0']);
    expect(predictor.tryFire(restingState(), 1, 0)).toBeNull();

    predictor.syncPanel(['w1:1']);
    expect(predictor.tryFire(restingState(), 1, 0)).not.toBeNull();

    // локальный декремент: второй выстрел уже без патронов
    expect(predictor.tryFire(restingState(), 1, 1000)).toBeNull();
  });

  it('смена оружия: cycleWeapon циклит список, панель (wa) авторитетна', () => {
    predictor.cycleWeapon(); // w1 → w2
    expect(predictor.tryFire(restingState(), 1, 0).w2).toBeDefined();

    predictor.cycleWeapon(); // w2 → w1 (зацикливание)
    expect(predictor.tryFire(restingState(), 1, 1000).w1).toBeDefined();

    predictor.syncPanel(['wa:w2']);
    expect(predictor.tryFire(restingState(), 1, 2000).w2).toBeDefined();
  });
});

describe('ShotPredictor: трассер (w1)', () => {
  it('muzzle-формула совпадает с серверной (width·0.55 вдоль angle+gun)', () => {
    const { w1 } = predictor.tryFire(restingState(), 1, 0);
    const [startX, startY, endX, endY, bodyX, bodyY, hit, shooterId] = w1[0];

    // width = size·4 = 64; смещение дула 64·0.55 = 35.2 вдоль оси X
    expect(startX).toBeCloseTo(35.2, 6);
    expect(startY).toBeCloseTo(0, 6);
    // промах: конец = дуло + range
    expect(hit).toBe(false);
    expect(endX).toBeCloseTo(35.2 + 1000, 6);
    expect(endY).toBeCloseTo(0, 6);
    expect(bodyX).toBe(0);
    expect(bodyY).toBe(0);
    expect(shooterId).toBe(1);
  });

  it('gunRotation поворачивает и дуло, и направление', () => {
    const state = { x: 0, y: 0, angle: 0, gunRotation: Math.PI / 2 };
    const { w1 } = predictor.tryFire(state, 1, 0);
    const [startX, startY, endX, endY] = w1[0];

    expect(startX).toBeCloseTo(0, 6);
    expect(startY).toBeCloseTo(35.2, 6);
    expect(endX).toBeCloseTo(0, 6);
    expect(endY).toBeCloseTo(35.2 + 1000, 6);
  });

  it('трассер утыкается в стену карты', () => {
    // стена (тайл 1) в клетке x=2: мир x ∈ [128, 192) при tileSize 64
    predictor.setMap({
      ...emptyMap(),
      map: [
        [0, 0, 1],
        [0, 0, 1],
        [0, 0, 1],
      ],
    });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);
    const [, , endX, , , , hit] = w1[0];

    expect(hit).toBe(true);
    expect(endX).toBeCloseTo(128, 6);
  });

  it('трассер утыкается в чужой танк, свой танк игнорируется', () => {
    // чужой танк (id 2) в 500 юнитах справа: halfW = size·2 = 32
    predictor.updateWorld({
      m1: {
        1: [0, 0, 0, 0, 0, 0, 0, 3, 16, 1], // свой — на линии огня
        2: [500, 0, 0, 0, 0, 0, 0, 3, 16, 2],
      },
    });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);
    const [, , endX, , , , hit] = w1[0];

    expect(hit).toBe(true);
    expect(endX).toBeCloseTo(500 - 32, 6);
  });

  it('трассер утыкается в динамический объект карты', () => {
    predictor.setMap({
      ...emptyMap(),
      physicsDynamic: [
        {
          position: [100, 0], // мир: ×scale(2) → (200, 0)
          angle: 0,
          width: 20, // мир: 40, halfW 20
          height: 100,
        },
      ],
    });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    expect(w1[0][6]).toBe(true);
    expect(w1[0][2]).toBeCloseTo(180, 6);

    // объект сдвинулся снапшотом — луч бьёт по новой позиции
    predictor.updateWorld({ c1: { d0: [400, 0, 0] } });

    const second = predictor.tryFire(restingState(), 1, 1000);

    expect(second.w1[0][2]).toBeCloseTo(380, 6);
  });

  it('удалённый танк (null) исключается из raycast', () => {
    predictor.updateWorld({ m1: { 2: [500, 0, 0, 0, 0, 0, 0, 3, 16, 2] } });
    predictor.updateWorld({ m1: { 2: null } });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    expect(w1[0][6]).toBe(false);
  });
});

describe('ShotPredictor: бомба (w2)', () => {
  it('спавнится под танком с локальным id и ownerId', () => {
    predictor.syncPanel(['wa:w2']);

    const state = { x: 42, y: -17, angle: 1, gunRotation: 0 };
    const { w2 } = predictor.tryFire(state, 3, 0);
    const [localId, params] = Object.entries(w2)[0];

    expect(localId).toMatch(/^L\d+$/);
    expect(params).toEqual([42, -17, 0, 8, 300, 3]);
  });
});

describe('ShotPredictor: подавление серверных дублей', () => {
  it('свой трассер подавляется ровно один раз (FIFO), чужой — нет', () => {
    predictor.tryFire(restingState(), 1, 0);

    const own = [0, 0, 10, 0, 0, 0, false, 1];
    const foreign = [0, 0, 10, 0, 0, 0, false, 2];

    const first = predictor.filterServerSnapshot({ w1: [own, foreign] }, 1, 100);

    expect(first.w1).toEqual([foreign]);

    // pending уже израсходован — второй свой дубль не съедается
    const second = predictor.filterServerSnapshot({ w1: [own] }, 1, 150);

    expect(second.w1).toEqual([own]);
  });

  it('протухший pending (>2с) не съедает свежие серверные трассеры', () => {
    predictor.tryFire(restingState(), 1, 0);

    const own = [0, 0, 10, 0, 0, 0, false, 1];
    const result = predictor.filterServerSnapshot({ w1: [own] }, 1, 2500);

    expect(result.w1).toEqual([own]);
  });

  it('без локальных выстрелов кадр возвращается как есть', () => {
    const game = { w1: [[0, 0, 1, 1, 0, 0, false, 1]] };

    expect(predictor.filterServerSnapshot(game, 1, 0)).toBe(game);
  });

  it('своя бомба: создание подавлено, null перенаправлен на локальный id', () => {
    predictor.syncPanel(['wa:w2']);

    const spawn = predictor.tryFire(restingState(), 1, 0);
    const localId = Object.keys(spawn.w2)[0];

    // серверное создание с ownerId=1 → подавить + remap
    const created = predictor.filterServerSnapshot(
      { w2: { a7: [0, 0, 0, 8, 300, 1] } },
      1,
      100,
    );

    expect(created.w2).toEqual({});

    // серверное удаление a7 → уходит локальной бомбе
    const removed = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 400);

    expect(removed.w2).toEqual({ [localId]: null });
  });

  it('чужая бомба проходит без изменений', () => {
    predictor.syncPanel(['wa:w2']);
    predictor.tryFire(restingState(), 1, 0);

    const game = { w2: { b1: [5, 5, 0, 8, 300, 2] } };
    const result = predictor.filterServerSnapshot(game, 1, 100);

    expect(result.w2).toEqual(game.w2);
  });

  it('reset очищает pending и remap', () => {
    predictor.tryFire(restingState(), 1, 0);
    predictor.reset();

    const own = [0, 0, 10, 0, 0, 0, false, 1];
    const result = predictor.filterServerSnapshot({ w1: [own] }, 1, 100);

    expect(result.w1).toEqual([own]);
    // активное оружие вернулось к дефолту модели
    expect(predictor.tryFire(restingState(), 1, 5000).w1).toBeDefined();
  });
});
