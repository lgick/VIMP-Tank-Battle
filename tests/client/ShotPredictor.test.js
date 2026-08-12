import { describe, it, expect, beforeEach } from 'vitest';
import ShotPredictor from '../../src/client/ShotPredictor.js';
import MapDynamics from '../../src/client/MapDynamics.js';
import RemoteTanks from '../../src/client/RemoteTanks.js';

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
  const mapDynamics = new MapDynamics();
  const p = new ShotPredictor({ models, weapons, mapDynamics });

  p.setModel('m1');
  p.setMap(emptyMap());
  mapDynamics.setMap({
    physicsDynamic: [],
    scale: emptyMap().scale,
    setId: 'c1',
  });

  return { p, mapDynamics };
};

let predictor;
let mapDynamics;

beforeEach(() => {
  ({ p: predictor, mapDynamics } = makePredictor());
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

    // подтвердить первую бомбу, иначе гейт заблокирует следующий w2
    predictor.filterServerSnapshot({ w2: { a1: [0, 0, 0, 8, 300, 1] } }, 1, 1500);

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

  it('трассер утыкается в динамический объект карты (угол объекта → центр)', () => {
    // угол объекта (сервер) (100,-50); мир ×scale(2) → (200,-100)
    // halfW = width(40)·scale/2 = 40, halfH = height(100)·scale/2 = 100
    // центр = угол + (halfW, halfH) = (240, 0) — НЕ (200,-100)
    mapDynamics.setMap({
      physicsDynamic: [
        { position: [100, -50], angle: 0, width: 40, height: 100 },
      ],
      scale: 2,
      setId: 'c1',
    });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    expect(w1[0][6]).toBe(true);
    // луч (y=0) входит в левую грань бокса (центр 240 − halfW 40 = 200),
    // а не в точку, которая была бы центром при ошибочной семантике «угол = центр»
    expect(w1[0][2]).toBeCloseTo(200, 6);

    // якорь: попадание в d0, локальная точка — левая грань относительно центра
    expect(w1[0][8][0]).toBe('d0');
    expect(w1[0][8][1]).toBeCloseTo(-40, 6);
    expect(w1[0][8][2]).toBeCloseTo(0, 6);

    // объект сдвинулся снапшотом — луч бьёт по новой позиции (та же геометрия)
    mapDynamics.update({ c1: { d0: [400, -100, 0] } });

    const second = predictor.tryFire(restingState(), 1, 1000);

    expect(second.w1[0][2]).toBeCloseTo(400, 6);
    expect(second.w1[0][8]).toEqual(['d0', expect.closeTo(-40), expect.closeTo(0)]);
  });

  it('едущий ящик: луч по авторитетной геометрии, конец трассера — по нарисованной', () => {
    mapDynamics.setMap({
      physicsDynamic: [
        { position: [100, -50], angle: 0, width: 40, height: 100 },
      ],
      scale: 2,
      setId: 'c1',
    });

    // авторитетно ящик на линии огня (центр 240, 0), а нарисован он
    // с задержкой интерполяции далеко в стороне (центр 240, 1000)
    mapDynamics.beginReconcile({ c1: { d0: [200, -100, 0, 300, 0, 0] } });
    mapDynamics.update({ c1: { d0: [200, 900, 0] } });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    // по рендерному боксу луч промахнулся бы вовсе
    expect(w1[0][6]).toBe(true);
    expect(w1[0][8]).toEqual(['d0', expect.closeTo(-40), expect.closeTo(0)]);

    // конец трассера — та же материальная точка нарисованного ящика
    expect(w1[0][2]).toBeCloseTo(200, 6);
    expect(w1[0][3]).toBeCloseTo(1000, 6);
  });

  it('трассер утыкается в повёрнутый динамический объект (угол объекта учитывает поворот)', () => {
    mapDynamics.setMap({
      physicsDynamic: [
        { position: [100, -20], angle: 90, width: 40, height: 60 },
      ],
      scale: 2,
      setId: 'c1',
    });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    expect(w1[0][6]).toBe(true);
    expect(w1[0][2]).toBeCloseTo(80, 6);
    expect(w1[0][3]).toBeCloseTo(0, 6);
    expect(w1[0][8][0]).toBe('d0');
  });

  it('удалённый танк (null) исключается из raycast', () => {
    predictor.updateWorld({ m1: { 2: [500, 0, 0, 0, 0, 0, 0, 3, 16, 2] } });
    predictor.updateWorld({ m1: { 2: null } });

    const { w1 } = predictor.tryFire(restingState(), 1, 0);

    expect(w1[0][6]).toBe(false);
  });
});

describe('ShotPredictor: трассер по чужому танку', () => {
  // танк id 2, size 10 → halfW 20, halfH 15; нарисован в (300, 60),
  // авторитетно уже в (300, 0) — на линии выстрела
  const drawn = [300, 60, 0, 0, 0, -600, 0, 3, 10, 1, 0];
  const authoritative = [300, 0, 0, 0, 0, -600, 0, 3, 10, 1, 0];

  const setup = remoteTanks => {
    const mapDynamics = new MapDynamics();
    const p = new ShotPredictor({ models, weapons, mapDynamics, remoteTanks });

    p.setModel('m1');
    p.setMap(emptyMap());
    mapDynamics.setMap({ physicsDynamic: [], scale: 2, setId: 'c1' });
    p.updateWorld({ m1: { 2: drawn } });

    return p;
  };

  it('луч идёт по корпусу «сейчас», а конец — по нарисованному', () => {
    const remoteTanks = new RemoteTanks(models);

    remoteTanks.setOwnGameId(1);
    remoteTanks.update({ m1: { 2: drawn } });
    remoteTanks.beginReconcile({ m1: { 2: authoritative } });
    remoteTanks.finishReconcile();

    const { w1 } = setup(remoteTanks).tryFire(restingState(), 1, 0);

    // сервер по своей геометрии попадает — попадает и клиент
    expect(w1[0][6]).toBe(true);
    // точка удара перенесена на нарисованный корпус: локально это та же
    // материальная точка (левая грань), иначе трассер обрывался бы в воздухе
    expect(w1[0][2]).toBeCloseTo(280, 6);
    expect(w1[0][3]).toBeCloseTo(60, 6);
  });

  it('без RemoteTanks луч идёт по нарисованному корпусу и мажет', () => {
    const { w1 } = setup(null).tryFire(restingState(), 1, 0);

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

  it('позиция не экстраполируется по скорости', () => {
    predictor.syncPanel(['wa:w2']);

    // клиент не знает своей латентности, поэтому бомба ложится ровно
    // в предсказанную позицию танка
    const state = { x: 10, y: 20, vx: 100, vy: 50, angle: 0, gunRotation: 0 };
    const { w2 } = predictor.tryFire(state, 1, 0);
    const [, params] = Object.entries(w2)[0];

    expect(params[0]).toBe(10);
    expect(params[1]).toBe(20);
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

  it('весь залп кадра свой: опустевший блок в кадр не попадает', () => {
    predictor.tryFire(restingState(), 1, 0);

    const own = [0, 0, 10, 0, 0, 0, false, 1];
    const game = { w1: [own] };
    const result = predictor.filterServerSnapshot(game, 1, 100);

    expect(result.w1).toBeUndefined();

    // исходный кадр не мутируется
    expect(game.w1).toEqual([own]);
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

  it('своя бомба: живёт под локальным id, серверные строки переезжают по алиасу', () => {
    predictor.syncPanel(['wa:w2']);

    const spawn = predictor.tryFire(restingState(), 1, 0);
    const localId = Object.keys(spawn.w2)[0];

    const bombData = [0, 0, 0, 8, 300, 1];

    // серверное создание: строка переезжает под локальный ключ (регистрируя
    // алиас a7 → L<n>) и одноразово поправляет позицию на авторитетную
    const created = predictor.filterServerSnapshot(
      { w2: { a7: bombData } },
      1,
      100,
    );

    expect(created.w2).toEqual({ [localId]: bombData });

    // взрыв: null переезжает под локальный ключ — снимает локальную сущность
    const explosion = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 400);

    expect(explosion.w2).toEqual({ [localId]: null });

    // алиас снят: последующий null по a7 проходит напрямую
    const after = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 500);

    expect(after.w2).toEqual({ a7: null });
  });

  it('чужая бомба проходит без изменений', () => {
    const game = { w2: { a7: [0, 0, 0, 8, 300, 2] } };

    expect(predictor.filterServerSnapshot(game, 1, 0)).toBe(game);
  });

  it('смерть с поставленной бомбой: детонация снимает сущность после resetLocal', () => {
    predictor.syncPanel(['wa:w2']);

    const spawn = predictor.tryFire(restingState(), 1, 0);
    const localId = Object.keys(spawn.w2)[0];

    predictor.filterServerSnapshot({ w2: { a7: [0, 0, 0, 8, 300, 1] } }, 1, 100);

    // смерть: keySet 0 → resetLocal(), gameId наблюдателя уже сброшен
    predictor.resetLocal();

    const explosion = predictor.filterServerSnapshot({ w2: { a7: null } }, null, 400);

    expect(explosion.w2).toEqual({ [localId]: null });
  });

  it('resetLocal хоронит неподтверждённую бомбу, но сохраняет алиасы', () => {
    predictor.syncPanel(['wa:w2']);

    const spawn = predictor.tryFire(restingState(), 1, 0);
    const localId = Object.keys(spawn.w2)[0];

    predictor.filterServerSnapshot({ w2: { a7: [0, 0, 0, 8, 300, 1] } }, 1, 100);

    // вторая бомба остаётся неподтверждённой
    const spawn2 = predictor.tryFire(restingState(), 1, 5000);
    const localId2 = Object.keys(spawn2.w2)[0];

    predictor.resetLocal();

    // похороны неподтверждённой + алиас первой пережил сброс
    const frame = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 5100);

    expect(frame.w2).toEqual({ [localId2]: null, [localId]: null });
  });

  it('reset снимает алиасы и не тащит похороны на очищенное полотно', () => {
    predictor.syncPanel(['wa:w2']);

    predictor.tryFire(restingState(), 1, 0);
    predictor.filterServerSnapshot({ w2: { a7: [0, 0, 0, 8, 300, 1] } }, 1, 100);

    predictor.reset();

    // после CLEAR полотно чистится целиком — доставлять null некому
    expect(predictor.filterServerSnapshot({}, 1, 200)).toEqual({});

    // алиас снят: серверный null проходит напрямую
    const frame = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 300);

    expect(frame.w2).toEqual({ a7: null });
  });

  it('алиас снимается по возрасту', () => {
    predictor.syncPanel(['wa:w2']);

    predictor.tryFire(restingState(), 1, 0);
    predictor.filterServerSnapshot({ w2: { a7: [0, 0, 0, 8, 300, 1] } }, 1, 100);

    // BOMB_ALIAS_MAX_AGE = 60000 мс
    const frame = predictor.filterServerSnapshot({ w2: { a7: null } }, 1, 61000);

    expect(frame.w2).toEqual({ a7: null });
  });

  it('гейт: вторая бомба блокируется до подтверждения первой сервером', () => {
    predictor.syncPanel(['wa:w2']);

    predictor.tryFire(restingState(), 1, 0);

    // кулдаун прошёл, но pending не пуст — выстрел блокируется
    expect(predictor.tryFire(restingState(), 1, 200)).toBeNull();

    // подтверждение сервером — pending очищен
    predictor.filterServerSnapshot({ w2: { a1: [0, 0, 0, 8, 300, 1] } }, 1, 300);

    // теперь можно снова
    expect(predictor.tryFire(restingState(), 1, 400)).not.toBeNull();
  });

  it('истёкший pending (>2с) инжектирует null для локальной бомбы', () => {
    predictor.syncPanel(['wa:w2']);

    const spawn = predictor.tryFire(restingState(), 1, 0);
    const localId = Object.keys(spawn.w2)[0];

    // спустя PENDING_MAX_AGE + 1мс: expired bomb → null инъекция
    const result = predictor.filterServerSnapshot({}, 1, 2001);

    expect(result.w2).toBeDefined();
    expect(result.w2[localId]).toBeNull();
  });

  it('чужая бомба проходит без изменений', () => {
    predictor.syncPanel(['wa:w2']);
    predictor.tryFire(restingState(), 1, 0);

    const game = { w2: { b1: [5, 5, 0, 8, 300, 2] } };
    const result = predictor.filterServerSnapshot(game, 1, 100);

    expect(result.w2).toEqual(game.w2);
  });

  it('reset очищает pending и expired', () => {
    predictor.tryFire(restingState(), 1, 0);
    predictor.reset();

    const own = [0, 0, 10, 0, 0, 0, false, 1];
    const result = predictor.filterServerSnapshot({ w1: [own] }, 1, 100);

    expect(result.w1).toEqual([own]);
    // активное оружие вернулось к дефолту модели
    expect(predictor.tryFire(restingState(), 1, 5000).w1).toBeDefined();
  });
});
