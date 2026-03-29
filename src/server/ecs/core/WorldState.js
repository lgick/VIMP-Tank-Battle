import BinaryGenId, { ID_FORMATS } from '../../../lib/BinaryGenId';

export class WorldState {
  constructor(max = 2048) {
    this.max = max;
    this.idGen = new BinaryGenId(ID_FORMATS.UINT16);

    // mapping
    this.entityId = new Uint32Array(max); // id
    this.entityIndex = new Uint32Array(max); // index by id

    this.active = new Uint8Array(max);
    this.type = new Uint8Array(max); // modelId

    // === transform ===
    this.posX = new Float32Array(max);
    this.posY = new Float32Array(max);
    this.angle = new Float32Array(max);
    this.gunAngle = new Float32Array(max);

    // === physics ===
    this.velX = new Float32Array(max);
    this.velY = new Float32Array(max);

    // === gameplay ===
    this.engineState = new Uint8Array(max);
    this.health = new Uint8Array(max);
    this.size = new Uint8Array(max);
    this.teamId = new Uint8Array(max);

    // === effects ===
    this.startX = new Float32Array(max);
    this.startY = new Float32Array(max);
    this.endX = new Float32Array(max);
    this.endY = new Float32Array(max);
    this.hit = new Uint8Array(max); // 0 или 1
    this.radius = new Uint8Array(max); // для AOE

    // === lifetime / removal ===
    this.toRemove = new Uint8Array(max);
    this.changed = new Uint8Array(max);
  }

  create() {
    const id = this.idGen.next();
    const index = id & this.idGen._indexMask;

    this.active[index] = 1;

    return id;
  }

  removeEntity(id) {
    if (!this.idGen.isValid(id)) {
      return;
    }

    const index = id & this.idGen._indexMask;

    this.active[index] = 0;
    this.toRemove[index] = 0;

    this.idGen.release(id);
  }
}
