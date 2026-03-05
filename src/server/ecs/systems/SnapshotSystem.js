export function SnapshotSystem(world, camera) {
  const entities = [];

  for (let i = 0; i < world.count; i++) {
    if (!world.active[i]) {
      continue;
    }

    const modelId = world.type[i];

    // === REMOVE ===
    if (world.toRemove[i]) {
      switch (modelId) {
        case 2: // player
          entities.push([2, world.gameId[i]]);
          break;

        case 3: // physical weapon
          entities.push([3, world.shotId[i]]);
          break;
      }

      world.active[i] = 0;
      world.toRemove[i] = 0;
      continue;
    }

    // === PLAYER ===
    if (modelId === 2) {
      entities.push([
        2,
        world.gameId[i],
        world.posX[i],
        world.posY[i],
        world.angle[i],
        world.gunAngle[i],
        world.velX[i],
        world.velY[i],
        world.engineState[i],
        world.health[i],
        world.size[i],
        world.teamId[i],
      ]);
    }

    // === PHYSICAL WEAPON ===
    else if (modelId === 3) {
      entities.push([
        3,
        world.shotId[i],
        world.posX[i],
        world.posY[i],
        world.angle[i],
        world.size[i],
      ]);
    }

    // === HITSCAN EFFECT ===
    else if (modelId === 4) {
      entities.push([
        4,
        world.posX[i],
        world.posY[i],
        world.velX[i], // startX
        world.velY[i], // startY
        world.gunAngle[i], // endX (пример)
        world.radius[i], // hit
      ]);
    }

    // === AOE EFFECT ===
    else if (modelId === 5) {
      entities.push([5, world.posX[i], world.posY[i], world.radius[i]]);
    }

    // === MAP DYNAMIC ===
    else if (modelId === 1) {
      entities.push([
        1,
        world.dynamicId[i],
        world.posX[i],
        world.posY[i],
        world.angle[i],
      ]);
    }
  }

  return [entities, [camera.x, camera.y, camera.shake, camera.reset]];
}
