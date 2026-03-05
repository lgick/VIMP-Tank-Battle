const arr = [
  [
    // remove player: [modelId, gameId]
    // [Uint8, Uint8],
    [2, 1],

    // player: [modelId, gameId, posX, posY, angle, gunAngle, velX, velY, engineState, health, size, teamId]
    // [Uint8, Uint8, Float32, Float32, Float32, Float32, Float32, Float32, Uint8, Uint8, Uint8, Uint8]
    [2, 2, 318.87, 276.57, -0.64, 0, 12.35, -9.18, 0, 90, 2, 1],

    // remove physical weapon: [modelId, shotId]
    // [Uint8, Uint16],
    [3, 1],

    // physical weapon: [modelId, shotId, posX, posY, angle, size]
    // [Uint8, Uint16, Float32, Float32, Float32, Uint8],
    [3, 4, 7.27, 587.58, 0, 8, 300],

    // hitscan weapon effect: [modelId, startX, startY, endX, endY, hit]
    // [Uint8, Float32, Float32, Float32, Float32, Uint8],
    [4, 9105.22, 796.3, 1107.71, 799.94, 0],

    // aoe weapon effect: [modelId, posX, posY, radius]
    // [Uint8, Float32, Float32, Uint8],
    [5, 590.33, 100.94, 50],

    // map dynamic: [modelId, dynamicId, posX, posY, angle]
    // [Uint8, Uint8, Float32, Float32, Float32],
    [1, 7, 624.24, 456.82, -1.09],
  ],

  // camera: [posX, posY, cameraShake, cameraReset]
  // [Float32, Float32, Uint8, Uint8],
  [40, 55, 0, 0],
];

function encodeGameState(data) {
  const entities = data[0];
  const camera = data[1];

  // сначала считаем сколько чисел будет
  let total = 1; // entityCount

  for (const item of entities) {
    total += 1 + item.length;
  }

  total += 1 + camera.length;

  const buffer = new ArrayBuffer(total * 4);
  const view = new Float32Array(buffer);

  let offset = 0;

  view[offset++] = entities.length;

  for (const item of entities) {
    view[offset++] = item.length;

    for (let i = 0; i < item.length; i++) {
      view[offset++] = item[i];
    }
  }

  view[offset++] = camera.length;

  for (let i = 0; i < camera.length; i++) {
    view[offset++] = camera[i];
  }

  return buffer;
}

function decodeGameState(buffer) {
  const view = new Float32Array(buffer);

  let offset = 0;

  const entityCount = view[offset++];
  const entities = [];

  for (let i = 0; i < entityCount; i++) {
    const length = view[offset++];
    const item = [];

    for (let j = 0; j < length; j++) {
      item.push(view[offset++]);
    }

    entities.push(item);
  }

  const cameraLength = view[offset++];
  const camera = [];

  for (let i = 0; i < cameraLength; i++) {
    camera.push(view[offset++]);
  }

  return [entities, camera];
}
