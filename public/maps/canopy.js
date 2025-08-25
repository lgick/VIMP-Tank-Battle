// public/maps/maze_of_doom.js

export default {
  setId: 'c1',

  spriteSheet: {
    img: 'tiles3.png',
    frames: [
      [0, 64, 32, 32], // 0: пол
      [0, 192, 32, 32], // 1: стена
      [96, 64, 32, 32], // 2: эффект блиндажа
    ],
  },

  layers: {
    1: [0, 1], // Слои под танком
    4: [2], // Слой над танком
  },

  step: 32,

  physicsStatic: [1], // Только стены статичны

  physicsDynamic: [
    {
      density: 1.2,
      layer: 3,
      position: [1280, 1184],
      angle: 0,
      width: 64,
      height: 64,
      img: 'b1.png',
    },
    {
      density: 1.2,
      layer: 3,
      position: [2048, 1184],
      angle: 0,
      width: 64,
      height: 64,
      img: 'b1.png',
    },
    {
      density: 1.2,
      layer: 3,
      position: [1664, 800],
      angle: 90,
      width: 64,
      height: 64,
      img: 'b1.png',
    },
    {
      density: 1.2,
      layer: 3,
      position: [1664, 1568],
      angle: 90,
      width: 64,
      height: 64,
      img: 'b1.png',
    },
  ],

  respawns: {
    team1: [
      // Центральная зона
      [224, 920, 0],
      [128, 1152, 0],
      [224, 1344, 0],
      [128, 1500, 0],
      // Верхняя зона
      [128, 256, 0],
      [224, 416, 0],
      [128, 576, 0],
      // Нижняя зона
      [224, 1824, 0],
      [128, 1984, 0],
      [224, 2144, 0],
    ],
    team2: [
      // Центральная зона
      [3136, 920, 180],
      [3232, 1152, 180],
      [3136, 1344, 180],
      [3232, 1500, 180],
      // Верхняя зона
      [3232, 256, 180],
      [3136, 416, 180],
      [3232, 576, 180],
      // Нижняя зона
      [3136, 1824, 180],
      [3232, 1984, 180],
      [3136, 2144, 180],
    ],
  },

  map: (function () {
    const width = 105;
    const height = 75;
    const tiles = { floor: 0, wall: 1, effect: 2 };

    const map = Array.from({ length: height }, () =>
      Array(width).fill(tiles.floor),
    );

    // Внешние стены
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (y === 0 || y === height - 1 || x === 0 || x === width - 1) {
          map[y][x] = tiles.wall;
        }
      }
    }

    // Генерация лабиринта
    const buildWall = (x1, y1, x2, y2) => {
      for (let y = y1; y <= y2; y++) {
        for (let x = x1; x <= x2; x++) {
          map[y][x] = tiles.wall;
        }
      }
    };

    // Укрытия на базах
    buildWall(10, 10, 10, height - 11);
    buildWall(width - 11, 10, width - 11, height - 11);
    buildWall(1, 25, 20, 25);
    buildWall(1, 50, 20, 50);
    buildWall(width - 21, 25, width - 2, 25);
    buildWall(width - 21, 50, width - 2, 50);

    // Центральный лабиринт
    buildWall(25, 0, 25, 15);
    buildWall(25, height - 16, 25, height - 1);
    buildWall(width - 26, 0, width - 26, 15);
    buildWall(width - 26, height - 16, width - 26, height - 1);

    buildWall(40, 15, 65, 15);
    buildWall(40, height - 16, 65, height - 16);
    buildWall(40, 25, 40, 50);
    buildWall(65, 25, 65, 50);

    // Центральный "блиндаж" (шахматный порядок)
    for (let y = 32; y < 43; y++) {
      for (let x = 1; x < width - 1; x++) {
        // Создаем шахматный узор
        if ((x + y) % 2 === 0) {
          map[y][x] = tiles.effect;
        } else {
          map[y][x] = tiles.floor;
        }
      }
    }

    return map;
  })(),
};
