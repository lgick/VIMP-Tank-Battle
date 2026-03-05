# ArrayBuffer

```js
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
```

---

# Бинарный формат Snapshot (Как упаковать твой `arr` в байты)

В бинарном формате мы не можем писать `[modelId, gameId, x, y]`. Вместо этого мы используем подход
**"Блочная разметка" (Block Layout)**. Перед каждым типом данных мы пишем `Count` (Сколько
элементов этого типа сейчас будет).

Вот как будет выглядеть твой идеальный бинарный пакет `SNAPSHOT` (структура внутри `ArrayBuffer`),
собранный с помощью `DataView`:

| Байт-смещение (Offset) | Тип данных | Описание                           |
| :--------------------- | :--------- | :--------------------------------- |
| **--- КАМЕРА ---**     |            | _Блок камеры (всегда 1 на игрока)_ |
| 0                      | `Float32`  | Camera X (твои 40)                 |
| 4                      | `Float32`  | Camera Y (твои 55)                 |
| 8                      | `Uint8`    | Camera Shake                       |
| 9                      | `Uint8`    | Camera Reset                       |
| **--- ИГРОКИ ---**     |            | _Блок живых танков_                |
| 10                     | `Uint8`    | **Количество танков (Count = N)**  |
| _Цикл N раз:_          |            | _(Размер одного танка: 26 байт)_   |
| + 0                    | `Uint8`    | modelId (2)                        |
| + 1                    | `Uint8`    | gameId (2)                         |
| + 2                    | `Float32`  | posX (318.87)                      |
| + 6                    | `Float32`  | posY (276.57)                      |
| + 10                   | `Float32`  | angle (-0.64)                      |
| + 14                   | `Float32`  | gunAngle (0)                       |
| + 18                   | `Float32`  | velX (12.35)                       |
| + 22                   | `Float32`  | velY (-9.18)                       |
| + 26                   | `Uint8`    | health (90)                        |
| + 27                   | `Uint8`    | teamId (1)                         |
| **--- ПУЛИ ---**       |            | _Блок физического оружия_          |
| X                      | `Uint16`   | **Количество пуль (Count = M)**    |
| _Цикл M раз:_          |            | _(Размер пули: 15 байт)_           |
| + 0                    | `Uint8`    | modelId (3)                        |
| + 1                    | `Uint16`   | shotId (4)                         |
| + 3                    | `Float32`  | posX (7.27)                        |
| + 7                    | `Float32`  | posY (587.58)                      |
| ...                    | ...        | ...                                |
| **--- УДАЛЕННЫЕ ---**  |            | _Блок удаления с полотна_          |
| Y                      | `Uint8`    | **Количество удаленных танков**    |
| Z                      | `Uint16`   | **Количество удаленных пуль**      |

---

# Как это собирать на сервере (Код `SnapshotPacker.js`)

Вот как будет выглядеть класс, который заменит твой `SnapshotManager` и превратит Data-Oriented ECS
данные в бинарник без создания мусора.

```javascript
// network/SnapshotPacker.js
export default class SnapshotPacker {
  constructor(maxBufferSize = 16384) {
    // Выделяем память один раз (16 КБ хватит на огромную карту)
    this.buffer = new ArrayBuffer(maxBufferSize);
    this.view = new DataView(this.buffer);
  }

  // Собираем кадр для конкретного игрока
  packForUser(cameraData, activePlayers, projectiles, hitscans, removedEntities) {
    let offset = 0;

    // 1. ПИШЕМ КАМЕРУ (10 байт)
    this.view.setFloat32(offset, cameraData.x);
    offset += 4;
    this.view.setFloat32(offset, cameraData.y);
    offset += 4;
    this.view.setUint8(offset, cameraData.shake);
    offset += 1;
    this.view.setUint8(offset, cameraData.reset);
    offset += 1;

    // 2. ПИШЕМ ТАНКИ
    this.view.setUint8(offset, activePlayers.length);
    offset += 1; // Count
    for (let i = 0; i < activePlayers.length; i++) {
      const p = activePlayers[i];
      // Здесь данные берутся ПРЯМО из твоих ECS TypedArrays!
      this.view.setUint8(offset, p.modelId);
      offset += 1;
      this.view.setUint8(offset, p.gameId);
      offset += 1;
      this.view.setFloat32(offset, ECS.TransformX[p.gameId]);
      offset += 4;
      this.view.setFloat32(offset, ECS.TransformY[p.gameId]);
      offset += 4;
      this.view.setFloat32(offset, ECS.Angle[p.gameId]);
      offset += 4;
      // ... и т.д.
    }

    // 3. ПИШЕМ ФИЗИЧЕСКОЕ ОРУЖИЕ
    this.view.setUint16(offset, projectiles.length);
    offset += 2; // Count (пуль может быть много)
    for (let i = 0; i < projectiles.length; i++) {
      const proj = projectiles[i];
      this.view.setUint8(offset, proj.modelId);
      offset += 1;
      this.view.setUint16(offset, proj.shotId);
      offset += 2;
      this.view.setFloat32(offset, proj.x);
      offset += 4;
      // ... и т.д.
    }

    // Возвращаем кусок буфера (slice), который реально заполнили
    // Это не копирует данные, а просто отдает ссылку на участок памяти для отправки
    return this.buffer.slice(0, offset);
  }
}
```

---

# Как это будет распаковывать Клиент?

На стороне браузера (PixiJS или твой клиент) код приема будет зеркальным и невероятно быстрым:

```javascript
socket.onmessage = async event => {
  // Если пришел бинарник (Blob/ArrayBuffer)
  if (event.data instanceof Blob || event.data instanceof ArrayBuffer) {
    const buffer = await event.data.arrayBuffer();
    const view = new DataView(buffer);

    const opCode = view.getUint8(0);

    if (opCode === 6) {
      // SNAPSHOT
      let offset = 1; // Пропускаем OpCode

      // Читаем Камеру
      const camX = view.getFloat32(offset);
      offset += 4;
      const camY = view.getFloat32(offset);
      offset += 4;
      const shake = view.getUint8(offset);
      offset += 1;
      const reset = view.getUint8(offset);
      offset += 1;

      // Читаем Танки
      const playersCount = view.getUint8(offset);
      offset += 1;
      for (let i = 0; i < playersCount; i++) {
        const modelId = view.getUint8(offset);
        offset += 1;
        const gameId = view.getUint8(offset);
        offset += 1;
        const x = view.getFloat32(offset);
        offset += 4;
        const y = view.getFloat32(offset);
        offset += 4;

        // Напрямую обновляем спрайт танка в PixiJS!
        updatePlayerSprite(gameId, x, y);
      }
      // И так далее для пуль...
    }
  }
  // Если пришел JSON (Чат, Статистика)
  else if (typeof event.data === 'string') {
    const [opCode, data] = JSON.parse(event.data);
    if (opCode === 5) {
      /* Обновить Чат */
    }
  }
};
```
