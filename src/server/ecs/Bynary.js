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
