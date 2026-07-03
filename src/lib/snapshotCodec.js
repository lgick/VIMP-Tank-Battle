import {
  SNAPSHOT_FORMAT_VERSION,
  SNAPSHOT_KEYS,
  SNAPSHOT_KEYS_BY_ID,
} from '../config/opcodes.js';
import { roundTo2Decimals } from './formatters.js';

// Бинарный кодек snapshot-кадра (порт SHOT_DATA).
// Сервер пакует через SnapshotPacker, клиент распаковывает через unpackFrame.
// DataView, big-endian. Раскладка кадра:
//   Uint8   port
//   Uint8   версия формата (SNAPSHOT_FORMAT_VERSION)
//   Uint32  seq
//   Float64 serverTime
//   Uint8   cameraFlags: bit0 hasCamera, bit1 forceReset, bit2 hasShake,
//           bit3 hasPlayer
//   [hasCamera] Float32 x, Float32 y
//   [hasShake]  Uint8 len + ASCII-байты строки 'intensity:duration'
//   [hasPlayer] Uint8 gameId, Uint32 inputSeq,
//               Float32 ×8 (x, y, angle, vx, vy, angvel, gunRotation,
//               throttle — БЕЗ округления: точность нужна предиктору),
//               Uint8 centering (центрирование башни)
//   далее блоки тела до конца буфера: Uint8 keyId + содержимое по kind
//     (раскладки блоков — в BLOCK_WRITERS/BLOCK_READERS ниже)
//
// Все float исходно скруглены сервером до 2 знаков (roundTo2Decimals/toFixed),
// поэтому декодер восстанавливает точные значения повторным скруглением
// (погрешность Float32 много меньше 0.005).

// запас на тело снапшота; выход за пределы бросит RangeError из DataView
const BODY_BUFFER_SIZE = 65536;

const CAMERA_FLAG_HAS_CAMERA = 1;
const CAMERA_FLAG_FORCE_RESET = 2;
const CAMERA_FLAG_HAS_SHAKE = 4;
const CAMERA_FLAG_HAS_PLAYER = 8;

// количество Float32-полей player-блока
const PLAYER_STATE_LENGTH = 8;

// размер player-блока: gameId(1) + inputSeq(4) + state(8×4) + centering(1)
const PLAYER_BLOCK_SIZE = 1 + 4 + PLAYER_STATE_LENGTH * 4 + 1;

const readFloat = (view, offset) =>
  roundTo2Decimals(view.getFloat32(offset));

// ***** писатели блоков (kind → раскладка) ***** //

// объект { gameId: данные | null }; null = удаление с полотна
const writeTanks = (view, offset, tanks) => {
  const ids = Object.keys(tanks);

  view.setUint8(offset, ids.length);
  offset += 1;

  for (const id of ids) {
    const data = tanks[id];

    view.setUint8(offset, Number(id));
    offset += 1;

    if (data === null) {
      view.setUint8(offset, 0);
      offset += 1;
      continue;
    }

    view.setUint8(offset, 1);
    offset += 1;

    // x, y, angle, gunRotation, vx, vy, engineLoad
    for (let i = 0; i < 7; i += 1) {
      view.setFloat32(offset, data[i]);
      offset += 4;
    }

    view.setUint8(offset, data[7]); // condition
    view.setUint8(offset + 1, data[8]); // size
    view.setUint8(offset + 2, data[9]); // teamId
    offset += 3;
  }

  return offset;
};

// массив [startX, startY, endX, endY, bodyX, bodyY, wasHit]
const writeTracers = (view, offset, tracers) => {
  view.setUint16(offset, tracers.length);
  offset += 2;

  for (const tracer of tracers) {
    for (let i = 0; i < 6; i += 1) {
      view.setFloat32(offset, tracer[i]);
      offset += 4;
    }

    view.setUint8(offset, tracer[6] ? 1 : 0);
    offset += 1;
  }

  return offset;
};

// объект { shotId(base36): данные | null }; null = удаление с полотна
const writeBombs = (view, offset, bombs) => {
  const ids = Object.keys(bombs);

  view.setUint16(offset, ids.length);
  offset += 2;

  for (const id of ids) {
    const data = bombs[id];

    view.setUint32(offset, parseInt(id, 36));
    offset += 4;

    if (data === null) {
      view.setUint8(offset, 0);
      offset += 1;
      continue;
    }

    view.setUint8(offset, 1);
    offset += 1;

    view.setFloat32(offset, data[0]); // x
    view.setFloat32(offset + 4, data[1]); // y
    view.setFloat32(offset + 8, data[2]); // angle
    offset += 12;

    view.setUint8(offset, data[3]); // size
    view.setUint16(offset + 1, data[4]); // time (ms)
    offset += 3;
  }

  return offset;
};

// массив [x, y, radius]
const writeExplosions = (view, offset, explosions) => {
  view.setUint16(offset, explosions.length);
  offset += 2;

  for (const explosion of explosions) {
    view.setFloat32(offset, explosion[0]);
    view.setFloat32(offset + 4, explosion[1]);
    view.setFloat32(offset + 8, explosion[2]);
    offset += 12;
  }

  return offset;
};

// объект { 'dN': [x, y, angle] } — динамические элементы карты
const writeDynamics = (view, offset, items) => {
  const keys = Object.keys(items);

  view.setUint8(offset, keys.length);
  offset += 1;

  for (const key of keys) {
    const data = items[key];

    view.setUint8(offset, Number(key.slice(1)));
    offset += 1;

    view.setFloat32(offset, data[0]);
    view.setFloat32(offset + 4, data[1]);
    view.setFloat32(offset + 8, data[2]);
    offset += 12;
  }

  return offset;
};

const BLOCK_WRITERS = {
  tanks: writeTanks,
  tracers: writeTracers,
  bombs: writeBombs,
  explosions: writeExplosions,
  dynamics: writeDynamics,
};

// ***** читатели блоков (зеркала писателей) ***** //

const readTanks = (view, offset) => {
  const result = {};
  const count = view.getUint8(offset);

  offset += 1;

  for (let n = 0; n < count; n += 1) {
    const id = view.getUint8(offset);
    const hasData = view.getUint8(offset + 1);

    offset += 2;

    if (!hasData) {
      result[id] = null;
      continue;
    }

    const data = [];

    for (let i = 0; i < 7; i += 1) {
      data.push(readFloat(view, offset));
      offset += 4;
    }

    data.push(
      view.getUint8(offset), // condition
      view.getUint8(offset + 1), // size
      view.getUint8(offset + 2), // teamId
    );
    offset += 3;

    result[id] = data;
  }

  return [result, offset];
};

const readTracers = (view, offset) => {
  const result = [];
  const count = view.getUint16(offset);

  offset += 2;

  for (let n = 0; n < count; n += 1) {
    const tracer = [];

    for (let i = 0; i < 6; i += 1) {
      tracer.push(readFloat(view, offset));
      offset += 4;
    }

    tracer.push(view.getUint8(offset) === 1);
    offset += 1;

    result.push(tracer);
  }

  return [result, offset];
};

const readBombs = (view, offset) => {
  const result = {};
  const count = view.getUint16(offset);

  offset += 2;

  for (let n = 0; n < count; n += 1) {
    const id = view.getUint32(offset).toString(36);
    const hasData = view.getUint8(offset + 4);

    offset += 5;

    if (!hasData) {
      result[id] = null;
      continue;
    }

    result[id] = [
      readFloat(view, offset), // x
      readFloat(view, offset + 4), // y
      readFloat(view, offset + 8), // angle
      view.getUint8(offset + 12), // size
      view.getUint16(offset + 13), // time (ms)
    ];
    offset += 15;
  }

  return [result, offset];
};

const readExplosions = (view, offset) => {
  const result = [];
  const count = view.getUint16(offset);

  offset += 2;

  for (let n = 0; n < count; n += 1) {
    result.push([
      readFloat(view, offset),
      readFloat(view, offset + 4),
      readFloat(view, offset + 8),
    ]);
    offset += 12;
  }

  return [result, offset];
};

const readDynamics = (view, offset) => {
  const result = {};
  const count = view.getUint8(offset);

  offset += 1;

  for (let n = 0; n < count; n += 1) {
    const index = view.getUint8(offset);

    offset += 1;

    result[`d${index}`] = [
      readFloat(view, offset),
      readFloat(view, offset + 4),
      readFloat(view, offset + 8),
    ];
    offset += 12;
  }

  return [result, offset];
};

const BLOCK_READERS = {
  tanks: readTanks,
  tracers: readTracers,
  bombs: readBombs,
  explosions: readExplosions,
  dynamics: readDynamics,
};

// ***** упаковка (сервер) ***** //

export class SnapshotPacker {
  /**
   * @param {number} port - Номер порта (первый байт каждого кадра).
   */
  constructor(port) {
    this._port = port;

    // тело снапшота пакуется один раз/тик в предвыделенный буфер
    this._bodyBuffer = new ArrayBuffer(BODY_BUFFER_SIZE);
    this._bodyView = new DataView(this._bodyBuffer);
    this._bodyBytes = new Uint8Array(this._bodyBuffer);
    this._bodyLength = 0;
  }

  /**
   * Пакует блоки сущностей снапшота (один раз за тик, broadcast-часть).
   * @param {Object} snapshot - { ключ: данные } (ключи из SNAPSHOT_KEYS).
   */
  packBody(snapshot) {
    const view = this._bodyView;
    let offset = 0;

    for (const key in snapshot) {
      if (Object.hasOwn(snapshot, key)) {
        const keyInfo = SNAPSHOT_KEYS[key];

        if (!keyInfo) {
          throw new Error(
            `[snapshotCodec] Неизвестный ключ снапшота '${key}': ` +
              'зарегистрируйте его в src/config/opcodes.js',
          );
        }

        view.setUint8(offset, keyInfo.id);
        offset += 1;

        offset = BLOCK_WRITERS[keyInfo.kind](view, offset, snapshot[key]);
      }
    }

    this._bodyLength = offset;
  }

  /**
   * Собирает кадр для конкретного пользователя: заголовок + копия тела.
   * Буфер всегда свежий: ws.send асинхронен, переиспользование
   * исказило бы очередь отправки.
   * @param {Array|0} camera - [x, y, forceReset?, shake?] либо 0.
   * @param {number} serverTime
   * @param {number} seq
   * @param {Object|null} [player] - Блок предикшена играющего:
   *   { gameId, inputSeq, state: Float[8], centering: boolean }.
   * @returns {ArrayBuffer}
   */
  packFrame(camera, serverTime, seq, player = null) {
    const hasCamera = camera !== 0;
    const shake = hasCamera && camera[3] ? String(camera[3]) : null;

    let headerSize = 15; // port + версия + seq + serverTime + cameraFlags

    if (hasCamera) {
      headerSize += 8;
    }

    if (shake) {
      headerSize += 1 + shake.length;
    }

    if (player) {
      headerSize += PLAYER_BLOCK_SIZE;
    }

    const frame = new ArrayBuffer(headerSize + this._bodyLength);
    const view = new DataView(frame);
    let offset = 0;

    view.setUint8(offset, this._port);
    view.setUint8(offset + 1, SNAPSHOT_FORMAT_VERSION);
    view.setUint32(offset + 2, seq);
    view.setFloat64(offset + 6, serverTime);
    offset += 14;

    let flags = 0;

    if (hasCamera) {
      flags |= CAMERA_FLAG_HAS_CAMERA;

      if (camera[2] === true) {
        flags |= CAMERA_FLAG_FORCE_RESET;
      }

      if (shake) {
        flags |= CAMERA_FLAG_HAS_SHAKE;
      }
    }

    if (player) {
      flags |= CAMERA_FLAG_HAS_PLAYER;
    }

    view.setUint8(offset, flags);
    offset += 1;

    if (hasCamera) {
      view.setFloat32(offset, camera[0]);
      view.setFloat32(offset + 4, camera[1]);
      offset += 8;
    }

    if (shake) {
      view.setUint8(offset, shake.length);
      offset += 1;

      for (let i = 0; i < shake.length; i += 1) {
        view.setUint8(offset, shake.charCodeAt(i));
        offset += 1;
      }
    }

    if (player) {
      view.setUint8(offset, player.gameId);
      view.setUint32(offset + 1, player.inputSeq);
      offset += 5;

      for (let i = 0; i < PLAYER_STATE_LENGTH; i += 1) {
        view.setFloat32(offset, player.state[i]);
        offset += 4;
      }

      view.setUint8(offset, player.centering ? 1 : 0);
      offset += 1;
    }

    new Uint8Array(frame).set(
      this._bodyBytes.subarray(0, this._bodyLength),
      offset,
    );

    return frame;
  }
}

// ***** распаковка (клиент) ***** //

/**
 * Распаковывает бинарный кадр в JSON-формы, идентичные серверным.
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{port: number, seq: number, serverTime: number,
 *   camera: Array|0, player: Object|null, snapshot: Object}|null}
 *   null при несовпадении версии.
 */
export const unpackFrame = arrayBuffer => {
  const view = new DataView(arrayBuffer);
  let offset = 0;

  const port = view.getUint8(offset);
  const version = view.getUint8(offset + 1);

  if (version !== SNAPSHOT_FORMAT_VERSION) {
    console.warn(
      `[snapshotCodec] Версия формата кадра ${version} не совпадает ` +
        `с ожидаемой ${SNAPSHOT_FORMAT_VERSION}, кадр отброшен`,
    );

    return null;
  }

  const seq = view.getUint32(offset + 2);
  const serverTime = view.getFloat64(offset + 6);

  offset += 14;

  const flags = view.getUint8(offset);

  offset += 1;

  let camera = 0;

  if (flags & CAMERA_FLAG_HAS_CAMERA) {
    camera = [readFloat(view, offset), readFloat(view, offset + 4)];
    offset += 8;

    if (flags & CAMERA_FLAG_FORCE_RESET) {
      camera[2] = true;
    }

    if (flags & CAMERA_FLAG_HAS_SHAKE) {
      const len = view.getUint8(offset);

      offset += 1;

      let shake = '';

      for (let i = 0; i < len; i += 1) {
        shake += String.fromCharCode(view.getUint8(offset));
        offset += 1;
      }

      camera[3] = shake;
    }
  }

  let player = null;

  if (flags & CAMERA_FLAG_HAS_PLAYER) {
    const gameId = view.getUint8(offset);
    const inputSeq = view.getUint32(offset + 1);

    offset += 5;

    const state = [];

    for (let i = 0; i < PLAYER_STATE_LENGTH; i += 1) {
      state.push(view.getFloat32(offset)); // без округления (предикшен)
      offset += 4;
    }

    const centering = view.getUint8(offset) === 1;

    offset += 1;

    player = { gameId, inputSeq, state, centering };
  }

  const snapshot = {};

  while (offset < view.byteLength) {
    const keyId = view.getUint8(offset);

    offset += 1;

    const keyInfo = SNAPSHOT_KEYS_BY_ID[keyId];

    if (!keyInfo) {
      console.warn(
        `[snapshotCodec] Неизвестный id блока ${keyId}, остаток кадра отброшен`,
      );

      break;
    }

    const [data, nextOffset] = BLOCK_READERS[keyInfo.kind](view, offset);

    snapshot[keyInfo.key] = data;
    offset = nextOffset;
  }

  return { port, seq, serverTime, camera, player, snapshot };
};
