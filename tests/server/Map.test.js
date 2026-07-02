import { describe, it, expect, beforeEach, vi } from 'vitest';
import RAPIER from '../../src/server/physics/rapier.js';

let Map;

// фейковый мир, регистрирующий созданные тела;
// дескрипторы тел/коллайдеров — реальные (RAPIER.RigidBodyDesc/ColliderDesc)
const makeWorld = () => {
  const created = [];
  return {
    created,
    createRigidBody(desc) {
      const body = {
        desc,
        colliders: [],
        userData: null,
        translation() {
          return desc.translation;
        },
        rotation() {
          return desc.rotation;
        },
      };
      created.push(body);
      return body;
    },
    createCollider(colliderDesc, body) {
      body.colliders.push(colliderDesc);
    },
    removeRigidBody: vi.fn(),
  };
};

// собирает данные карты для createMap
const mapData = (rows, opts = {}) => ({
  map: rows,
  step: 10,
  physicsStatic: [1],
  physicsDynamic: opts.physicsDynamic || [],
  spriteSheet: { frames: {} },
});

// удобный доступ к статическим телам (по центру и половинным размерам)
const staticBodies = world =>
  world.created
    .filter(b => b.desc.status === RAPIER.RigidBodyType.Fixed)
    .map(b => ({
      x: b.desc.translation.x,
      y: b.desc.translation.y,
      hw: b.colliders[0].shape.halfExtents.x,
      hh: b.colliders[0].shape.halfExtents.y,
    }));

beforeEach(async () => {
  vi.resetModules();
  Map = (await import('../../src/server/parts/Map.js')).default;
});

describe('Map.searchStaticBlock: слияние тайлов', () => {
  it('одиночный тайл → блок 1x1', () => {
    const world = makeWorld();
    const map = new Map(world);
    map.createMap(
      mapData([
        [1, 0],
        [0, 0],
      ]),
    );

    const bodies = staticBodies(world);
    expect(bodies).toHaveLength(1);
    // центр в (5,5), половинные размеры 5x5 (step=10)
    expect(bodies[0]).toEqual({ x: 5, y: 5, hw: 5, hh: 5 });
  });

  it('горизонтальный ряд сливается в один прямоугольник', () => {
    const world = makeWorld();
    new Map(world).createMap(mapData([[1, 1, 0]]));

    const bodies = staticBodies(world);
    expect(bodies).toHaveLength(1);
    // ширина 2 тайла = 20, центр x=10; высота 10, центр y=5
    expect(bodies[0]).toEqual({ x: 10, y: 5, hw: 10, hh: 5 });
  });

  it('вертикальный столбец сливается в один прямоугольник', () => {
    const world = makeWorld();
    new Map(world).createMap(mapData([[1], [1], [0]]));

    const bodies = staticBodies(world);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ x: 5, y: 10, hw: 5, hh: 10 });
  });

  it('блок 2x2 сливается в один прямоугольник', () => {
    const world = makeWorld();
    new Map(world).createMap(
      mapData([
        [1, 1],
        [1, 1],
      ]),
    );

    const bodies = staticBodies(world);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({ x: 10, y: 10, hw: 10, hh: 10 });
  });

  it('два раздельных тайла дают два тела', () => {
    const world = makeWorld();
    new Map(world).createMap(mapData([[1, 0, 1]]));

    expect(staticBodies(world)).toHaveLength(2);
  });
});

describe('Map.createDynamic', () => {
  it('создаёт динамические тела и помечает их как map_object', () => {
    const world = makeWorld();
    const map = new Map(world);
    map.createMap(
      mapData([[0]], {
        physicsDynamic: [
          {
            angle: 0,
            position: [100, 200],
            width: 20,
            height: 10,
            density: 1,
          },
        ],
      }),
    );

    const dyn = world.created.filter(
      b => b.desc.status === RAPIER.RigidBodyType.Dynamic,
    );
    expect(dyn).toHaveLength(1);
    expect(dyn[0].userData).toEqual({ type: 'map_object' });
  });

  it('getDynamicMapData возвращает позицию и угол по id', () => {
    const world = makeWorld();
    const map = new Map(world);
    map.createMap(
      mapData([[0]], {
        physicsDynamic: [
          {
            angle: 0,
            position: [1.234, 5.678],
            width: 20,
            height: 10,
            density: 1,
          },
        ],
      }),
    );

    const data = map.getDynamicMapData();
    expect(data.d0).toEqual([1.23, 5.68, 0]);
  });
});

describe('Map.destroyMap', () => {
  it('пересоздание карты уничтожает старые тела', () => {
    const world = makeWorld();
    const map = new Map(world);

    map.createMap(mapData([[1]])); // 1 статическое тело
    map.createMap(mapData([[1]])); // пересоздание → удаление старого

    expect(world.removeRigidBody).toHaveBeenCalled();
  });
});
