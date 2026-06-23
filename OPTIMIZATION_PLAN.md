# План оптимизации VIMP Tank Battle (сервер + сеть + клиент) — детальная версия

> Статус: **в работе**. Документ — исполнительная спецификация рефакторинга.
> Каждая фаза — самостоятельный мёржабельный инкремент с зелёными тестами.
>
> **Прогресс:** ✅ Фаза 0, ✅ Фаза 1, ✅ Фаза 2 (2a VoteCoordinator, 2b RoundManager,
> 2c CommandProcessor) — реализованы и закоммичены (613 тестов зелёные, eslint чист).
> Следующее: Фаза 3 (разделение сетевых каналов). Track B (Rapier) — не начат.
>
> Отклонения от плана по ходу реализации:
> - **Единое числовое пространство id** для людей и ботов (вместо префикса `'_'` у ботов) —
>   снимает противоречие с `Uint8`-упаковкой Фазы 4 заранее.
> - `ParticipantManager` владеет только записями участников, размерами команд, списком активных,
>   генерацией id/имён; кросс-модульная регистрация (`Stat/Panel/Chat/Vote/RTTManager`) осталась
>   в вызывающих (`VIMP.createUser/removeUser`, `BotManager.createBots/_removeBotById`).
> - `_changeName` и `reportKill` переехали в `RoundManager` (VIMP держит тонкий прокси `reportKill`,
>   который дёргает `Game`).

## Контекст

`VIMP.js` (1391 строка) — «god object»: владеет 10 модулями, хранит реестр `_users`, ведёт
lifecycle, команды, раунды, голосования, чат-команды и сборку сетевого кадра. Данные одного
пользователя размазаны по 7 местам (`VIMP._users`, `Stat`, `Panel`, `Chat`, `Vote`, `RTTManager`,
`Game._playersData`). Боты живут отдельно (`BotManager._bots` + `BotController`), при этом
`BotManager` напрямую читает приватные поля VIMP (`_users`, `_teams`, `_teamSizes`,
`_spectatorTeam`, `_maxPlayers`, `checkName`). И боты, и игроки одинаково создают `Tank` в
`Game._playersData` и идут через `Tank.updateKeys/updateData/getData`; различие — источник ввода
(WebSocket vs AI) и наличие сокета. Весь обмен идёт одним JSON-кадром на порту `5`:
`[gameSnapshot, coords, panel, stat, chat, vote, keySet]` — горячие игровые данные смешаны с
редкой мета-информацией и шлются каждый тик.

Цель: разгрузить VIMP, ввести единый источник истины для участников (игроки+боты), отделить
snapshot от меты, перевести snapshot в бинарный формат (мета — JSON), подготовить клиент к
бинарь+JSON и заложить фундамент под client-side prediction/interpolation. Отдельным треком —
миграция planck → Rapier.

### Согласованные решения
- Модель данных: прагматичный single source of truth (обычные классы), **без bitecs**.
- Бинарь: ручной `DataView` block-layout с предвыделенным `ArrayBuffer`, без библиотек.
- Физика: миграция planck → Rapier как отдельный Track B.
- Объём: полный roadmap по фазам, упорядоченный по зависимостям.

### Установленные факты кодовой базы (опора для деталей)
- `Tank.getData()` → `[x, y, angle, gunRotation, vx, vy, engineLoad, condition, size, teamId]`
  (`condition` 3/2/1/0). Источник — `src/server/parts/Tank.js`, через `BaseModel`.
- Ключи снапшота: `m1` (танки, объект `{gameId: data[]}`), `w1` (hitscan-эффекты, массив),
  `w2` (бомбы, объект `{shotId: data[]}`), `w2e` (эффекты взрыва, массив), `c1`/`c2`/`d*`
  (карта и динамика, по setId). См. `src/config/client.js` `parts.gameSets`.
- Текущие порты (`src/config/wsports.js`): server `0..12` (свободны `9 MISC`, `12 CONSOLE`),
  client `0..8`.
- Снапшот **одинаков для всех** (нет per-user culling); per-user только `coords`/panel/chat/vote.
  Подтверждено `VIMP._onShotTick:137-225` (общий `gameSnapshot`, `getUserData` меняет лишь камеру и
  персональные мета-данные).
- `getWorldState()` (`Game.js:631`) строит свежий контейнер; `_cachedPlayersData[gameId]` каждый
  тик переприсваивается новым массивом (`Game.js:370`). Реального aliasing-бага нет — чтение для
  бинаря неразрушающее.
- API модулей (стабильны, переиспользуем):
  - `Stat`: `addUser(gameId, teamId, data)`, `removeUser(gameId, teamId)`,
    `moveUser(gameId, teamId, newTeamId, data)`, `updateUser(gameId, teamId, data)`,
    `updateHead(teamId, param, value)`, `getLast()`, `getFull()`.
  - `Panel`: `addUser(gameId)`, `removeUser(gameId)`, `updateUser(gameId, param, value, op)`,
    `setActiveWeapon`, `hasResources`, `getCurrentValue`, `processUpdates()`, `getFullPanel`,
    `getEmptyPanel`.
  - `Chat`: `addUser`/`removeUser`, `push`/`pushSystem`/`pushSystemByUser`, `shift`/`shiftByUser`.
  - `Vote`: `addUser`/`removeUser`, `createVote`, `addInVote`, `getResult`, `hasVoteCategory`,
    `shift`/`shiftByUser`.
  - `RTTManager`: `addUser(gameId)`, `removeUser(gameId)`, `scheduleNextPing()`, `handlePong`.
  - `Game`: `createPlayer(gameId, model, name, teamId, data)`, `removePlayer`, `updateKeys`,
    `getPosition`, `changePlayerData`, `getAlivePlayers`, `isAlive`, `applyDamage`,
    `getWorldState`, `getEvents`, `getPlayersData`, `getDynamicMapData`.
  - `BaseModel`: `updateKeys({action,name})`, `getKeysForProcessing()`, геттеры
    `gameId/teamId/name/model/currentWeapon`.

---

## Архитектурный принцип

```
VIMP (фасад/wiring + делегирование тика)
 ├─ ParticipantManager   — единый реестр игроков и ботов (источник истины)
 ├─ RoundManager         — раунды, team wipe, рестарт, spectator↔active, смена карты
 ├─ CommandProcessor     — парсинг чат-команд (/name, /bot, /nr, /timeleft, ...)
 ├─ VoteCoordinator      — создание/кулдаун/сброс голосований
 ├─ Game (planck → Rapier) — физика, Tank/Bomb, getWorldState/getEvents
 ├─ Network: SnapshotManager + SnapshotPacker (бинарь) + SocketManager
 └─ Cold path: Panel, Stat, Chat, Vote, RTTManager (JSON)
```

---

## Фаза 0 — Проверка изоляции данных snapshot (малая) ✅ ВЫПОЛНЕНО
> Реализовано: регресс-тесты в `tests/server/SnapshotManager.test.js` (aliasing не обнаружен,
> код не менялся). Коммит `881194e`.
Подтвердить, что бинаризация (Фаза 4) читает данные неразрушающе и что мутации в
`SnapshotManager.processTick()` не портят кэш Game (анализ показал — не портят).
- **Действия:** добавить регресс-тест, фиксирующий, что после `processTick()` повторный
  `getWorldState()` отдаёт корректные данные; при обнаружении реального aliasing — собирать снапшот
  в собственный объект (не мутировать `worldState`-контейнер in-place).
- **Файлы:** `src/server/modules/SnapshotManager.js`, `src/server/modules/Game.js:631`.
- **Тесты:** дополнить `tests/server/SnapshotManager.test.js`.

---

## Фаза 1 — Единая модель участника (игроки + боты) ✅ ВЫПОЛНЕНО
> Реализовано: `src/server/player/{Participant,HumanParticipant,BotParticipant,ParticipantManager}.js`;
> миграция VIMP/BotManager/BotController; единое числовое пространство id. Тесты
> `ParticipantManager.test.js` + обновлённые. Коммит `b320b5e`.

### Новые файлы
`src/server/player/Participant.js`, `HumanParticipant.js`, `BotParticipant.js`,
`ParticipantManager.js`.

### Схема классов
```js
// Participant.js — общая база (источник истины полей, общих для людей и ботов)
class Participant {
  gameId; name; model; team; teamId;
  status = 'spectator';           // 'spectator' | 'active' | 'dead'
  constructor({ gameId, name, model, team, teamId }) { ... }
  get isBot() { return false; }
  get isNetworked() { return false; }
  getInput() { return null; }     // переопределяется
}

// HumanParticipant.js — поля и поведение, специфичные для реального игрока
class HumanParticipant extends Participant {
  socketId; isReady = false; currentMap = null;
  isWatching = true; watchedGameId = null;
  forceCameraReset = true; pendingShake = null;
  lastActionTime = Date.now();
  get isNetworked() { return true; }
  getInput() { /* источник — WebSocket keys (как сейчас updateKeys → game.updateKeys) */ }
  send(...) { /* через SocketManager по socketId */ }
}

// BotParticipant.js — бот всегда active-или-удалён, никогда не спектатор
class BotParticipant extends Participant {
  controller = null;              // BotController
  get isBot() { return true; }
  getInput() { /* источник — controller (AI) */ }
}
```
Обоснование разделения: `socketId/isReady/currentMap/isWatching/watchedGameId/forceCameraReset/
pendingShake/lastActionTime` встречаются только у людей (боты их не имеют — подтверждено
`BotManager.createBots:154` и тем, что `_setSpectatorFromActivePlayer`/`_replaceWatchedPlayer`/
`_removeFromActivePlayers` итерируют только `this._users`).

### ParticipantManager API
```js
class ParticipantManager {
  constructor(teams, spectatorTeam, maxPlayers)  // teams: { team1:1, ... }
  // реестр
  createHuman(params, socketId): gameId          // числовой id
  createBot({ team, model }): gameId             // id с префиксом '_'
  remove(gameId): void
  get(gameId): Participant | undefined
  getAll(): Participant[]
  getHumans(): HumanParticipant[]
  getBots(): BotParticipant[]
  getNetworkedReady(): HumanParticipant[]        // замена Object.values(_users).filter(isReady)
  // имена
  checkName(name): string                        // перенос из VIMP.checkName
  // команды
  getTeamSize(team): number
  addToTeam(gameId, team) / removeFromTeam(gameId, team)
  resetTeamSizes()
  // активные игроки (для наблюдения)
  addActive(gameId) / removeActive(gameId)       // removeActive перецепляет watchedGameId людей
  getActiveList(): gameId[]
  replaceWatched(victimId, killerId)             // перенос _replaceWatchedPlayer
  get totalCount(): number                       // люди + боты (для лимита maxPlayers)
}
```
Внутри: `_participants: Map<gameId, Participant>`, `_teamSizes: { team: Set }`,
`_activePlayersList: string[]`, генераторы id (числовой / `'_'+n`).

### Маппинг текущего кода → ParticipantManager
| Сейчас | Переезжает |
|---|---|
| `VIMP._users` (объект) | `ParticipantManager._participants` (Map) |
| `VIMP.checkName` (472) | `ParticipantManager.checkName` |
| `VIMP._teamSizes`, `_resetTeamSizes` (638) | `teamSizes` + `resetTeamSizes` |
| `VIMP._activePlayersList`, `_addToActivePlayers`/`_removeFromActivePlayers` (646/653) | `addActive`/`removeActive`/`getActiveList` |
| `VIMP._replaceWatchedPlayer` (669) | `replaceWatched` |
| `BotManager._bots` Map (27) | удаляется; боты в реестре менеджера |
| `BotManager` чтения `vimp._users/_teams/_teamSizes/_spectatorTeam/_maxPlayers/checkName` (116-182) | вызовы API ParticipantManager |
| `reportKill`: `this._users[id] || this._bots.getBotById(id)` (763) | `participants.get(id)` |
| ветвления `!user.isBot` (628, 778, 804) | `participant.isNetworked` / полиморфизм (`send`/`getInput`) |

`BotManager` остаётся ответственным только за: `BotController` (Map), `NavigationSystem`,
`SpatialManager`, `updateBots`, `buildSpatialGrid`, создание/удаление **контроллеров** (а данные
участника-бота — в ParticipantManager). `BotController` берёт данные из `BotParticipant`, а не из
локального `botData`.

### Изменения в VIMP
- В конструкторе создать `this._participants = new ParticipantManager(...)`, прокинуть его в
  `Bots` вместо `this`.
- `createUser`/`removeUser`/`updateKeys`/`reportKill`/`_setActivePlayer`/
  `_setSpectatorFromActivePlayer`/`_changeTeam`/`getUserData` переписать на API менеджера.
- Рассылка в `_onShotTick:155`: `this._participants.getNetworkedReady()` вместо
  `Object.values(this._users).filter(isReady)`.

### Тесты
- Новый `tests/server/ParticipantManager.test.js`: create/remove людей и ботов, дедуп имён, лимит
  `maxPlayers`, teamSizes, activeList + перецепление watchedGameId, генерация id.
- Обновить существующие тесты VIMP/Bot под новый источник истины.

---

## Фаза 2 — Декомпозиция VIMP ✅ ВЫПОЛНЕНО
> Реализовано тремя инкрементами: 2a `VoteCoordinator` (`1a03fe2`), 2b `RoundManager` (`0a147a0`),
> 2c `CommandProcessor` (`95a6002`). VIMP сведён с 1391 → ~530 строк (фасад). Файлы в
> `src/server/core/`. Тесты `VoteCoordinator/RoundManager/CommandProcessor.test.js`.

### Новые файлы
`src/server/core/RoundManager.js`, `CommandProcessor.js`, `VoteCoordinator.js`.

### Маппинг методов VIMP (по строкам) → менеджеры
- **RoundManager** ← `_startRound` (415), `_initiateNewRound` (408), `_checkTeamWipe` (684),
  end-of-round часть `reportKill` (762), `_setActivePlayer` (617), `_setSpectatorFromActivePlayer`
  (602), `_changeTeam` (508), `_changeMap` (1062), `_getMapList` (1043), `_onMapTimeEnd` (131),
  round-часть `_createMap` (274).
- **CommandProcessor** ← `_parseCommand` (1130), `_executeBotCommand` (1243), `_initiateBotVote`
  (1268); `pushMessage` (972) делегирует сюда.
- **VoteCoordinator** ← `_createVote` (1335), `_canCreateVote` (1317), `_resetVote` (1371),
  `parseVote` (993).
- **VIMP оставляет:** конструктор/wiring, `_onShotTick` (делегирует сборку кадра), мост колбэков
  `TimerManager`/`RTTManager` (`_kickForMaxLatency`/`_kickForMissedPings`/`_kickIdleUsers`/
  `_sendPing`/`updateRTT`), тонкие прокси (`updateKeys`, `pushMessage`, `parseVote`, `sendMap`,
  `mapReady`, `firstShotReady`, `createUser`, `removeUser`).

Менеджеры получают зависимости через конструктор (DI), как уже делает VIMP
(`injectServices`-паттерн): `ParticipantManager`, `Game`, `Panel`, `Stat`, `Chat`, `Vote`,
`TimerManager`, `SocketManager`.

### Тесты
- `tests/server/RoundManager.test.js`, `CommandProcessor.test.js`, `VoteCoordinator.test.js` —
  изолированно, синглтоны/DI через `vi.resetModules()` + динамический import (паттерн из CLAUDE.md).
- VIMP-тесты сократить до фасадных (делегирование вызовов).

---

## Фаза 3 — Разделение сетевых каналов (ещё JSON)

### Новые серверные порты (`src/config/wsports.js`, server)
```
PANEL_DATA: 13,
STAT_DATA: 14,
CHAT_DATA: 15,
VOTE_DATA: 16,
```
(существующие `0..12` не трогаем; `SHOT_DATA: 5` остаётся каналом snapshot).

### Изменение кадра snapshot (порт 5)
Было: `[gameSnapshot, coords, panel, stat, chat, vote, keySet]`.
Стало: `[gameSnapshot, camera, serverTime, seq]`, где
- `camera` = `[x, y, forceReset?, shake?]` (per-user, как текущий `coords`);
- `serverTime` = `Date.now()` (или монотонные мс) — фундамент интерполяции;
- `seq` = инкрементный номер кадра.

`gameSnapshot` собирается один раз/тик (broadcast), `camera` — per-user.

### Мета — отдельными каналами, по изменению
- `SocketManager`: `sendPanel`, `sendStat`, `sendChat`, `sendVote` (новые), вызываются только при
  наличии изменений (а не каждый тик): из `_onShotTick` дергать
  `panel.processUpdates()`/`chat.shift*`/`vote.shift*`/`stat.getLast()` и слать на свои порты лишь
  при непустом результате.
- `keySet` (смена клавиатурного режима спектатор/игрок) вынести на свой канал/`MISC` или в момент
  смены статуса (а не в каждом кадре).

### Клиент (`src/client/main.js`)
- Добавить обработчики `socketMethods[PS_PANEL_DATA] = d => modules.panel.update(d)` и аналогично
  stat/chat/vote.
- `shotData` сократить до разбора `gameSnapshot` + `camera` (+ сохранить `serverTime/seq` для
  будущей интерполяции). Снять из него panel/stat/chat/vote.

### Файлы
`src/config/wsports.js`, `src/server/socket/SocketManager.js`,
`src/server/modules/VIMP.js` (`_onShotTick`/`getUserData`), `src/client/main.js`.

### Тесты
- `SocketManager`: новые методы шлют на корректные порты.
- Клиент: dispatch по новым портам (happy-dom).

---

## Фаза 4 — Бинарный snapshot (мета остаётся JSON)

### OpCodes (`src/config/opcodes.js`)
Деление каналов на бинарные и JSON (поверх существующих числовых портов):
```
binary: { SNAPSHOT: 5, PING: 10 }
json:   { AUTH:2, MAP:3, PANEL:13, STAT:14, CHAT:15, VOTE:16, ... }
```
OpCode = первый байт ЛЮБОГО сообщения.

### Реестр modelId для бинаря
Строковые ключи → `Uint8` (единый источник на сервере и клиенте, напр. в `opcodes.js`):
```
m1 → 2 (танк), w1 → 4 (hitscan-эффект), w2 → 3 (бомба),
w2e → 5 (эффект взрыва), c1 → 1 (карта/динамика)
```

### Байтовая раскладка snapshot (Block Layout, DataView, big-endian по умолчанию)
| Offset | Тип | Поле |
|---|---|---|
| 0 | Uint8 | **версия формата** |
| +1 | Float32 | camera X |
| +5 | Float32 | camera Y |
| +9 | Uint8 | cameraShake |
| +10 | Uint8 | cameraReset |
| +11 | Uint8 | **Count танков N** |
| _цикл N_ | | _(танк)_ |
| +0 | Uint8 | modelId (2) |
| +1 | Uint8 | gameId |
| +2 | Float32 | posX |
| +6 | Float32 | posY |
| +10 | Float32 | angle |
| +14 | Float32 | gunAngle |
| +18 | Float32 | velX |
| +22 | Float32 | velY |
| +26 | Uint8 | engineLoad |
| +27 | Uint8 | condition |
| +28 | Uint8 | size |
| +29 | Uint8 | teamId |
| ... | Uint16 | **Count бомб M** + цикл (modelId, shotId Uint16, posX/Y/angle Float32, size Uint8) |
| ... | Uint8/Uint16 | блоки `w1`/`w2e` эффектов (Count + поля по `docs/arraybuffer.md`) |
| ... | Uint8 | блок динамической карты (Count + dynamicId, posX/Y/angle) |
| ... | Uint8/Uint16 | блок удалённых сущностей (Count танков, Count пуль) |

Размер танка 30 байт. Camera/serverTime/seq можно вынести в общий заголовок; per-user пакуется
только camera-часть (snapshot-блоки переиспользуются).

### SnapshotPacker (`src/server/network/SnapshotPacker.js`)
- Предвыделенный `ArrayBuffer(16384)` + `DataView`, без аллокаций в горячем пути.
- `pack(snapshot, camera, serverTime, seq): ArrayBuffer` — пишет блоки, возвращает
  `buffer.slice(0, offset)`. Snapshot-часть пакуется один раз/тик; camera дописывается per-user
  (либо отдельный мини-буфер на игрока).
- Заменяет JSON-сборку кадра порта 5.

### SocketManager / транспорт
- `src/server/socket/index.js:60` (`ws.socket.send`): добавить
  `sendBinary(socketId, opCode, arrayBuffer)` (склейка `Uint8` opCode + payload, `ws.send(buf,
  {binary:true})`) и `sendJson(socketId, opCode, data)` (текущий JSON-путь).
- `SocketManager.sendShot` → бинарь через packer; мета (panel/stat/chat/vote) — `sendJson`.

### Клиент
- `ws.onmessage`: ветвление — `ArrayBuffer`/`Blob` → бинарный декодер; `string` → JSON
  (`socketMethods[portId]`).
- Зеркальный декодер snapshot → объект формата, который ждёт `GameCtrl.parse(name, instances)`
  через `gameSets`/`entitiesOnCanvas` (`src/config/client.js`,
  `src/client/components/controller/Game.js`).
- Версия формата проверяется первым байтом.

### Файлы
`src/server/network/SnapshotPacker.js` (новый), `src/config/opcodes.js` (новый),
`src/server/socket/SocketManager.js`, `src/server/socket/index.js`, `src/client/main.js`,
`src/client/components/controller/Game.js`.

### Тесты
- Round-trip: `SnapshotPacker.pack(...)` → клиентский декодер → значения совпадают (Float32 с
  допуском), Count-блоки корректны при 0/1/N сущностях.
- Проверка версии формата (несовпадение → безопасная обработка).

---

## Фаза 5 — Client-side prediction + interpolation (после Фазы 4)
Делать только когда базовая игра и каналы стабильны (помечено в CLAUDE.md).
- **Свой танк:** prediction + reconciliation. Добавить input sequence в `KEYS_DATA` (порт 5
  клиента); локальная симуляция движения в `requestAnimationFrame`; коррекция к серверной позиции
  при расхождении (server authoritative).
- **Чужие танки:** snapshot interpolation. Буфер 3–4 снапшотов с `serverTime` (из Фазы 3),
  `renderTime = serverTime - bufferTime` (~100–150 мс), `lerp` по `x/y/rotation`.
- **Снаряды:** визуальный client-side spawn; физика/урон — сервер.
- **Файлы:** клиент `parts/LocalTank`/`RemoteTank`, `components/*/Game`, `Controls`;
  сервер — приём input-seq в keys.
- Зависит от меток времени/seq (Фаза 3) и бинарь-канала (Фаза 4).

---

## Track B (крупный, изолированный) — миграция planck → Rapier
Ортогонален сети; после Фазы 1–2, можно параллельно Фазам 3–4, обязательно до Фазы 5.
- Заменить planck-мир/тела на Rapier (WASM) в `src/server/modules/Game.js` и
  `src/server/parts/` (`Tank`, `Bomb`, `BaseModel`, `Map`, `HitscanService`).
- Сохранить ощущение через гибридный подход: импульсы (разгон/инерция) + аркадные корректировки
  (`clampMaxSpeed`, `applyLateralFriction`, `applyTorqueImpulse`), строгий порядок фаз тика и
  `world.step()` в конце.
- Учесть: WASM-инициализация асинхронна (повлияет на bootstrap сервера, `Game` конструктор);
  пересмотреть тесты (сейчас опираются на реальный planck и моки `world`/`body`).
- Риски: наибольший объём и регрессии в ощущении управления; отдельный трек, чтобы не блокировать
  сетевые улучшения.

---

## Критичные файлы (сводка)
- `src/server/modules/VIMP.js` — декомпозиция (Фазы 1–3).
- `src/server/modules/bots/BotManager.js`, `BotController.js` — отвязать от приватных полей VIMP.
- `src/server/modules/SnapshotManager.js` — Фаза 0; стык со SnapshotPacker.
- `src/server/modules/Game.js` — `getWorldState/getEvents/getPlayersData`; Track B (Rapier).
- `src/server/socket/SocketManager.js`, `src/server/socket/index.js` — бинарь/JSON отправка.
- `src/config/wsports.js` (+ новый `opcodes.js`), `src/config/client.js`.
- `src/client/main.js`, `src/client/components/controller/Game.js` — приём бинарь+JSON.
- Новые: `src/server/player/{Participant,HumanParticipant,BotParticipant,ParticipantManager}.js`,
  `src/server/core/{RoundManager,CommandProcessor,VoteCoordinator}.js`,
  `src/server/network/SnapshotPacker.js`.

## Верификация (каждая фаза)
- `npx eslint .` + `npm test` (Vitest) зелёные; CI `.github/workflows/test.yml`.
- Новые модули покрыть юнит-тестами по паттернам CLAUDE.md (синглтоны через `vi.resetModules()` +
  динамический import; физ-части с моками `world`/`body`).
- Фаза 4: round-trip pack→unpack.
- Ручная проверка мультиплеера: несколько вкладок (при необходимости отключить `oneConnection` в
  `src/config/server.js`); движение, стрельба, бомбы, чат, голосования, статистика, боты (`/bot`),
  смена карты, спектатор, kick по idle/RTT.
- Track B: отдельно валидировать ощущение управления против planck.

## Порядок выполнения
~~Фаза 0~~ → ~~1~~ → ~~2~~ → **3** → 4 → 5. Track B — после Фазы 2 (можно начинать),
параллельно 3–4, до Фазы 5.
