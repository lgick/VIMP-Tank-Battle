# Как передавать данные по WebSocket (Модернизация `SocketManager`)

В твоем текущем коде `index.js` есть функция:

```javascript
send: (port, data) => {
  ws.send(JSON.stringify([port, data]));
};
```

Её нужно прокачать. WebSocket умеет отправлять `ArrayBuffer` или `Buffer` (в Node.js) напрямую.

**Новый подход:** В первый байт ЛЮБОГО сообщения (и бинарного, и текстового) мы кладем "Порт"
(теперь это называется **OpCode**).

```javascript
// SocketManager.js
sendBinary(gameId, opCode, arrayBuffer) {
    const ws = this._sessions.get(gameId);
    if (ws && ws.readyState === 1) { // 1 = OPEN
        // Делаем новый буфер на 1 байт больше, чтобы вписать OpCode в начало
        const finalBuffer = new Uint8Array(arrayBuffer.byteLength + 1);
        finalBuffer[0] = opCode; // Твой порт, например 6 (SNAPSHOT)
        finalBuffer.set(new Uint8Array(arrayBuffer), 1);

        ws.send(finalBuffer, { binary: true }); // Отправляем сырые байты!
    }
}

sendJson(gameId, opCode, data) {
    const ws = this._sessions.get(gameId);
    if (ws && ws.readyState === 1) {
        // Оставляем как было для Чата, Голосования, Статистики
        ws.send(JSON.stringify([opCode, data]));
    }
}
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

# Итог:

1. Твоя файловая структура разделяет логику на **ECS (Data-Oriented)** и **Meta (OOP/JSON)**.
2. Твой `wsports.js` переезжает в `OpCodes.js`, где порты разделяются на бинарные (Snapshot, Panel,
   Ping) и JSON (Auth, Chat, Stat).
3. Ты не используешь массивы JS `[ [2, 1], ... ]` для физики. Ты пишешь числа плоским потоком прямо
   в байты через `DataView.setFloat32()`. Это подарит твоей игре киберспортивную скорость и
   устранит лаги сети и сборщика мусора.
