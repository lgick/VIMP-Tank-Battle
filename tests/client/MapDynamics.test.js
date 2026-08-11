import { describe, it, expect, beforeEach } from 'vitest';
import MapDynamics from '../../src/client/MapDynamics.js';

// один ящик: угол объекта (сервер) (100, 0), 0°, width 40/height 20 (мир,
// после scale) → halfW 20, halfH 10 → центр (120, 10)
const setup = (scale = 1) => {
  const md = new MapDynamics();

  md.setMap({
    physicsDynamic: [
      { position: [100, 0], angle: 0, width: 40, height: 20 },
    ],
    scale,
  });

  return md;
};

describe('MapDynamics: setMap (угол объекта → центр)', () => {
  it('строит бокс с центром, а не углом объекта', () => {
    const md = setup();
    const box = md.getBox('d0');

    expect(box).toEqual({ x: 120, y: 10, angle: 0, halfW: 20, halfH: 10 });
  });

  it('учитывает scale карты', () => {
    const md = setup(2);
    const box = md.getBox('d0');

    // угол мира: (200, 0); halfW 40, halfH 20 → центр (240, 20)
    expect(box).toEqual({ x: 240, y: 20, angle: 0, halfW: 40, halfH: 20 });
  });

  it('неизвестный ключ — null', () => {
    const md = setup();

    expect(md.getBox('d1')).toBeNull();
  });
});

describe('MapDynamics: update (снапшот/интерполированный сэмпл)', () => {
  let md;

  beforeEach(() => {
    md = setup();
  });

  it('обновляет трансформ по ключу c*, сохраняя halfW/halfH', () => {
    md.update({ c1: { d0: [500, 50, Math.PI / 2] } });

    const box = md.getBox('d0');

    // угол (500,50) + rotateVec((20,10), 90°) = (500-10, 50+20) = (490, 70)
    expect(box.x).toBeCloseTo(490, 6);
    expect(box.y).toBeCloseTo(70, 6);
    expect(box.angle).toBeCloseTo(Math.PI / 2, 6);
    expect(box.halfW).toBe(20);
    expect(box.halfH).toBe(10);
  });

  it('игнорирует ключи не из динамики карты (танки и т.п.)', () => {
    const before = md.getBox('d0');

    md.update({ m1: { 1: [1, 2, 3] } });

    expect(md.getBox('d0')).toEqual(before);
  });

  it('игнорирует неизвестные dN внутри cN', () => {
    md.update({ c1: { d9: [1, 2, 3] } });

    expect(md.getBox('d9')).toBeNull();
  });

  it('null/undefined game — no-op', () => {
    const before = md.getBox('d0');

    md.update(null);

    expect(md.getBox('d0')).toEqual(before);
  });
});

describe('MapDynamics: toLocal', () => {
  it('переводит мировую точку в локальный (неповёрнутый) фрейм ящика', () => {
    const md = setup(); // box: центр (120, 10), angle 0

    const local = md.toLocal('d0', 130, 15);

    expect(local).toEqual({ x: 10, y: 5 });
  });

  it('учитывает поворот ящика', () => {
    const md = setup();

    md.update({ c1: { d0: [100, 0, Math.PI / 2] } });

    const box = md.getBox('d0');
    // мировая точка на +X от центра; при повороте бокса на 90° это
    // соответствует локальной −Y (toLocal вращает на −angle)
    const worldX = box.x + 20;
    const worldY = box.y;
    const local = md.toLocal('d0', worldX, worldY);

    expect(local.x).toBeCloseTo(0, 6);
    expect(local.y).toBeCloseTo(-20, 6);
  });

  it('неизвестный ключ — null', () => {
    const md = setup();

    expect(md.toLocal('d9', 0, 0)).toBeNull();
  });
});

describe('MapDynamics: getBoxes/замена геометрии', () => {
  it('getBoxes отдаёт все боксы разом', () => {
    const md = new MapDynamics();

    md.setMap({
      physicsDynamic: [
        { position: [0, 0], angle: 0, width: 10, height: 10 },
        { position: [50, 50], angle: 0, width: 10, height: 10 },
      ],
      scale: 1,
    });

    expect(Object.keys(md.getBoxes()).sort()).toEqual(['d0', 'd1']);
  });

  it('повторный setMap полностью заменяет геометрию', () => {
    const md = setup();

    md.setMap({ physicsDynamic: [], scale: 1 });

    expect(md.getBox('d0')).toBeNull();
    expect(md.getBoxes()).toEqual({});
  });

  // регресс: CLEAR приходит и на старте раунда, без MAP_DATA следом
  // (RoundManager._startRound). Метода сброса нет намеренно — иначе боксы
  // стирались бы навсегда: update() обновляет только известные ключи
  it('сброса геометрии не существует: она живёт до следующей MAP_DATA', () => {
    const md = setup();

    expect(md.reset).toBeUndefined();

    // кадры после CLEAR продолжают двигать те же боксы
    md.update({ c1: { d0: [300, 0, 0] } });

    expect(md.getBox('d0').x).toBeCloseTo(320, 6);
  });
});
