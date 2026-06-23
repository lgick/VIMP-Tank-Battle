# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Rule

**СТРОГОЕ ПРАВИЛО**: Все ответы, пояснения, комментарии к коду и любые сообщения в ходе работы писать ИСКЛЮЧИТЕЛЬНО на русском языке. Это правило имеет наивысший приоритет и не имеет исключений.

## Project Overview

VIMP Tank Battle — a multiplayer 2D real-time online tank game. The server runs an authoritative physics loop; clients render via PixiJS and communicate over WebSocket.

## Commands

```bash
# Development (nodemon watches src/server, src/lib, src/config, src/data)
npm run dev

# Production
npm start

# Build (processes audio + Vite bundle)
npm run build

# Lint
npx eslint .

# Tests (Vitest)
npm test            # одиночный прогон
npm run test:watch  # watch-режим при разработке
npm run test:coverage
```

### Dev prerequisites

Local HTTPS certificates are required for development. ViteExpress serves the Vite-built client alongside the Express server.

```bash
brew install mkcert nss
mkcert -install
mkdir .certs && cd .certs
mkcert -key-file key.pem -cert-file cert.pem localhost 127.0.0.1 ::1
```

In production, the server runs plain HTTP behind Nginx (which handles HTTPS). `.env` file controls runtime config (`VIMP_DOMAIN`, `VIMP_PORT`, `VIMP_PLAYERS`, `VIMP_MAP`, `VIMP_ROUND_TIME`, `VIMP_MAP_TIME`, `VIMP_FRIENDLY_FIRE`).

## Architecture

### Server (`src/server/`)

The game server is Node.js + Express + `ws` WebSockets + ViteExpress.

**`VIMP` (singleton)** in `src/server/modules/VIMP.js` is a **facade** (~530 строк): wiring + делегирование тика + жизненный цикл соединения (`createUser`/`removeUser`/`updateKeys`/`pushMessage`/`parseVote`/`sendMap`/`mapReady`/`firstShotReady`/`updateRTT`/`reportKill`/`triggerCameraShake`) + мост колбэков `TimerManager`/`RTTManager`. Бизнес-логика вынесена в отдельные менеджеры. VIMP владеет модулями:
- `ParticipantManager` (`src/server/player/`) — **единый источник истины об участниках** (игроки + боты): реестр, размеры команд, список активных, генерация id (единое числовое пространство), проверка имён, наблюдение. Участники — классы `Participant`/`HumanParticipant`/`BotParticipant`. Различение бот/человек — через геттеры `isBot`/`isNetworked`, не по формату id.
- `RoundManager` (`src/server/core/`) — раунды, команды, карты: `createMap`/`startRound`/`initiateNewRound`/`changeTeam`/`changeMap`/`changeName`/`checkTeamWipe`/`reportKill`/`setActive`/`setSpectator`. Владеет состоянием раунда/карты (`currentMap`, `currentMapData`, `scaledMapData`, `isRoundEnding`, `removedPlayersList`).
- `CommandProcessor` (`src/server/core/`) — парсинг чат-команд (`/name`, `/nr`, `/timeleft`, `/mapname`, `/bot`); `pushMessage` делегирует сюда.
- `VoteCoordinator` (`src/server/core/`) — создание/кулдаун/сброс голосований (`canCreateVote`/`createVote`/`reset`).
- `Game` — physics world (Planck.js/Box2D), players, weapons, map
- `Panel` — per-player HUD data
- `Stat` — scoreboard (body rows + head totals, with configurable sort)
- `Chat` — messages (user + system templates)
- `Vote` — voting system with queue, cooldowns, pagination
- `TimerManager` — all game timers (round, map, vote, RTT ping, idle check)
- `SnapshotManager` — throttles physics snapshots before sending to clients
- `RTTManager` — ping/pong latency tracking and kick thresholds
- `Bots` — server-side AI (`src/server/modules/bots/`): BotController, NavigationSystem, Pathfinder, SpatialManager

**Game loop**: `TimerManager` fires `onShotTick` at ~120 Hz. Physics is stepped, a snapshot is optionally produced (controlled by `networkSendRate`), then per-user data is assembled and sent via `SocketManager.sendShot`.

**`SocketManager`** (`src/server/socket/`) wraps WebSocket sends; all wire messages are framed as `[portId, payload]` JSON arrays using numeric IDs from `src/config/wsports.js`.

**User lifecycle**: connect → auth → `createUser` (spectator) → `sendMap` → `mapReady` → `firstShotReady` (ready for game loop) → `removeUser` on disconnect.

**Bots** функционально идентичны реальным игрокам, но с ограниченным набором действий. Данные участника-бота живут в `ParticipantManager` (общий реестр), `BotManager` отвечает только за `BotController`/`NavigationSystem`/`SpatialManager` и навигацию. `BotController` берёт данные через `ParticipantManager`/`BotManager`, **не читает приватные поля VIMP**. Боты и игроки делят единое числовое пространство id. Полная унификация ботов и игроков в одну абстракцию — цель на будущее.

### Client (`src/client/`)

Entry point: `src/client/main.js`. It opens a WebSocket and dispatches to `socketMethods[portId]`.

**MVC triplets** in `src/client/components/`: each game feature (Auth, CanvasManager, Controls, Game, Chat, Panel, Stat, Vote) has a `model/`, `view/`, and `controller/` file.

Publisher-паттерн внутри MVC-тройки:
- `main.js` или `view` → методы `controller` вызываются **напрямую**
- `controller` → методы `model` вызываются **напрямую**
- `model` → методы `view` вызываются **через `Publisher`** (model публикует событие, view подписана)
- На модель могут подписываться и внешние подписчики (не только view)
- `Publisher` допустимо использовать везде, где это удобно и улучшает читаемость

**CanvasManager** управляет несколькими PixiJS `Application` одновременно:
- `vimp` — основной игровой canvas (все игровые сущности)
- `radar` — упрощённый вид `vimp` (мини-карта); данные с сервера могут поступать в оба canvas

**Rendering parts** in `src/client/parts/`: entity classes (`Tank`, `Map`, `Bomb`, `Tracks`, etc.) rendered on PixiJS `Application` instances. `LocalTank` and `RemoteTank` extend `BaseTank`. Effects (explosions, smoke, tracers) are in `parts/effects/`. При создании новой `part` смотреть на существующие как образец — фиксированного контракта нет.

**Texture baking** (`src/client/providers/BakingProvider.js`): procedural textures are generated once at startup using `bakers/` and cached. `DependencyProvider` injects renderer/soundManager into entities. При создании нового baker-а ориентироваться на существующие файлы в `bakers/` — фиксированного интерфейса нет.

**`Factory`** (`src/lib/factory.js`): registry that maps entity names (e.g. `'tank'`, `'bullet'`) to their constructor classes. `GameCtrl.parse(name, data)` creates/updates/removes entity instances based on incoming snapshot data.

### Shared

- **`src/config/`** — shared config consumed by both server (Node.js) and client (Vite bundler): `game.js`, `client.js`, `auth.js`, `server.js`, `sounds.js`, `wsports.js`.
- **`src/lib/`** — utilities: `Publisher` (observer), `AbstractTimer`, `factory`, `math`, `formatters`, `sanitizers`, `validators`, `security`.
- **`src/data/`** — static game data: `maps/` (tiled map definitions with respawns + physics bodies), `models.js`, `weapons.js`.
- **`src/server/player/`** — единый реестр участников: `Participant`/`HumanParticipant`/`BotParticipant`, `ParticipantManager`.
- **`src/server/core/`** — менеджеры, выделенные из VIMP: `RoundManager`, `CommandProcessor`, `VoteCoordinator`.

### WebSocket Protocol

All messages: `[portId, payload]` serialized as JSON.

Port IDs live in `src/config/wsports.js`. Key server→client ports: `0` config, `1` auth data, `3` map, `4` first shot, `5` shot (game frame), `6` sound, `7` game inform, `8` tech inform, `10` ping, `11` clear. Key client→server ports: `0` config ready, `1` auth, `2` map ready, `3` first shot ready, `4` keys, `5` chat, `6` vote, `7` pong.

**Текущее состояние**: все данные, включая снапшоты (порт `5`), передаются в JSON. При рассинхроне клиента и сервера коррекции нет — клиент просто отображает пришедшие данные.

## Client UI Components (z-index stacking)

`vimp` canvas (1) → `radar` (2) → `chat` (3) → `panel` (4) → `vote` (5) → `game-informer` (6) → `stat` (7) → `auth` (8) → `tech-informer` (9).

## Code Conventions

- ES modules throughout (`"type": "module"`)
- Именование: `camelCase` для переменных и функций, `PascalCase` для классов, `UPPER_SNAKE_CASE` для констант
- Нет двух заглавных букв подряд в camelCase (ESLint enforces this, exceptions: `VX`, `VY`, `RTT`)
- `===` required (`eqeqeq`)
- `let`/`const` only (`no-var`)
- Curly braces required for all blocks
- Files/dirs prefixed with `_` **игнорируются ESLint и Claude**: не читать, не редактировать, не предлагать изменения — если только разработчик явно не укажет иное в переписке
- **Тесты**: Vitest. Подробности и паттерны — в разделе [Testing](#testing)
- **Импорты**: при редактировании файла приводить к порядку: Node.js built-ins → npm пакеты → внутренние модули проекта → относительные пути
- **Качество кода**: чистота и читаемость важнее краткости. Хардкорные решения и хаки недопустимы. При спорных архитектурных решениях или выборе паттерна — уточнять у разработчика
- **Комментарии**: лаконичные, по сути. Объяснять *зачем*, а не *что*; без развёрнутых рассуждений и многострочных пояснений там, где хватает короткой строки
- Новые сущности (entity) выполнять в едином стиле с существующими; при отсутствии шаблона — придерживаться сложившегося стиля кодовой базы

## Testing

- **Стек**: Vitest + happy-dom (клиент) + `@vitest/coverage-v8`. Конфиг `vitest.config.js` — два проекта: `node` (`tests/server`, `tests/lib`, `tests/config`, окружение node) и `client` (`tests/client`, окружение happy-dom). Интеграционные тесты лежат в `tests/server/integration/` и гоняются в node-проекте.
- **Запуск**: `npm test` (одиночный прогон), `npm run test:watch`, `npm run test:coverage`. CI: `.github/workflows/test.yml` гоняет `eslint` + тесты на каждый push/PR.
- **Расположение**: тесты в `tests/`, зеркалят структуру `src/` (не рядом с кодом). Файлы тестов имеют override в `eslint.config.js` (глобалы Vitest).
- **Покрыто** (~613 тестов): вся логика `lib/` (включая `security`); серверные модули с логикой (Stat, Vote, RTTManager, SnapshotManager, Panel, Chat, TimerManager, Pathfinder, SpatialManager, NavigationSystem, HitscanService, BaseModel, Bomb, Map, Tank, BotManager, BotController, SocketManager, Game, VIMP); реестр участников (`ParticipantManager`) и менеджеры из `core/` (`VoteCoordinator`, `RoundManager`, `CommandProcessor`); клиентские модели (Chat, Vote, Controls, Stat, Panel, Auth, Game, CanvasManager) + InputListener, SoundManager; клиентские контроллеры и view (все 8 — DOM через happy-dom); **интеграционный слой** (`tests/server/integration/`): полный жизненный цикл VIMP с реальными модулями + протокольный слой `socket/index.js`.
- **Не покрыто** (низкий ROI для unit-тестов): Pixi-`parts/`+`effects/`, провайдеры (`BakingProvider`/`DependencyProvider`).
- **Паттерны** (соблюдать при добавлении тестов):
  - **Синглтоны** (Game, Vote, Stat, Map, Panel, TimerManager, HitscanService, SnapshotManager, клиентские `*Model`, InputListener) изолируют через `vi.resetModules()` в `beforeEach` + динамический `await import(...)`.
  - **`planck` под Vitest работает** (Vec2/Rot/World/BoxShape реальные, импорт не требует моков). НО синхронный бесконечный цикл в тестируемом коде вешает весь прогон — при зависании искать infinite loop в коде, а не в конфиге Vitest.
  - **Физические части** (Tank, Bomb, Map, Game) тестируются с моками `world`/`body`/`panel`; реальная физика не симулируется. Для проверки геометрии `BoxShape` мокается через `vi.mock('planck', async io => ({ ...(await io()), BoxShape: ... }))`.
  - **Тяжёлые синглтоны с громоздким конструктором** (VIMP) тестируются двумя способами: изолированные методы — через прототип `Class.prototype.method.call(fakeThis, ...)` (юнит); оркестрация — интеграционно (см. ниже).
  - **Интеграционные тесты** (`tests/server/integration/`): строят реальный VIMP со всеми реальными модулями + `FakeSocketManager` (пишет wire-кадры) через общий `harness.js`. Критично: `vi.useFakeTimers()` ДО конструктора VIMP (тот стартует таймеры/игровой цикл); игровой цикл двигать прямыми `vimp._onShotTick(dt)`, а не `advanceTimers`; `process.nextTick`-колбэки (createUser, security.origin) ждать через `await nextTick()`. Протокольный слой (`socket/index.js`) тестируется через `vi.doMock('ws', ...)` + фейковый `ws`/`req` (origin `https://localhost:3000` проходит dev-allowlist). Детерминизм физики: ассертить факт/направление, а критичные исходы (kill) гнать через реальный `Game.applyDamage`.
  - Имя метода-мока, совпадающее с API planck (`queryAABB`), задавать вычисляемым/строковым ключом — иначе ESLint `no-consecutive-caps`.
- **Зафиксированные тестами поведенческие особенности** (не блокеры, но учитывать при доработках): `CanvasManager.resize` при `fixSize` отдаёт `height` строкой; `waiting.getNext` возвращает `undefined` (не `null`) при пустой очереди; `sanitizeMessage` — не XSS-защита (экранирование на выводе: `textContent` для текста, `setAttribute` для имени); удаляет только управляющие символы и возвращает `''` для не-строк; `validateAuth` непоследователен (ранний `return` для missing/non-string vs накопление ошибок валидаторов).

## Local Development

- Мультиплеер локально: открыть несколько вкладок браузера
- Если нужно несколько одновременных соединений с одного клиента, отключить `oneConnection: true` в `src/config/server.js` (по умолчанию разрывает предыдущее соединение при новом подключении)
- Debug-режима нет; при необходимости реализовать отдельно

## Deployment

- CI/CD конфигурация в `.github/`
- Только production-окружение (staging отсутствует)

## Sound System

Звуки описаны в `src/config/sounds.js`: каждый звук имеет `file` (имя файла без расширения), `priority` (выше = важнее при конкуренции), `volume`, опционально `loop: true`.

Воспроизведение через `src/client/SoundManager.js`:
- **UI/системные звуки** (не привязаны к позиции): `soundManager.playSystemSound(soundName)` — воспроизводится немедленно, в обход системы приоритетов.
- **Пространственные звуки** (привязаны к позиции в мире): `registerSound(soundName, { position })` → `processAudibility()` → `updateActiveSounds()`. `SoundManager` сам решает, какие звуки слышны, соблюдая лимит голосов (`WORLD_VOICE_LIMIT = 30`) и систему приоритетов.

Добавление нового звука: добавить запись в `src/config/sounds.js`, положить аудиофайл в `public/sounds/` в форматах `.webm` и `.mp3`.

## Adding a New Map

1. Create `src/data/maps/<name>.js` following the existing map format (layers, tiles, respawns, physicsStatic, physicsDynamic).
2. Export and register it in `src/data/maps/index.js`.
3. The map name becomes available in votes and via `VIMP_MAP` env var.

## Adding a New Weapon

Существует два архитектурно разных типа оружия:

**Hitscan** (пример: `w1` — пуля): попадание рассчитывается мгновенно лучом на сервере через `HitscanService`. Нет физического снаряда — только результат (куда попало).

**Explosive** (пример: `w2` — бомба): создаётся физический снаряд (`Bomb`) в мире Planck.js. Живёт в физическом цикле, передаётся клиенту как сущность в снапшоте, взрывается при контакте.

Шаги добавления нового оружия:
1. Определить оружие в `src/data/weapons.js`.
2. Выбрать тип (hitscan или explosive) и реализовать серверную часть в `src/server/parts/` по аналогии с существующим оружием того же типа.
3. Создать клиентский рендеринг в `src/client/parts/`.
4. Зарегистрировать сущность в `src/config/client.js` в `parts.gameSets` и `parts.entitiesOnCanvas`.

## Known Issues / Future Tasks

- **Снапшоты в бинарном формате**: сейчас все данные (включая игровые кадры порт `5`) отправляются в JSON. Нужно отделить snapshot-данные и передавать их в бинарном формате для снижения нагрузки на сеть.
- **Клиент-серверная синхронизация**: при рассинхроне коррекции нет. Нужна реализация client-side prediction / reconciliation (описана в `_TODO/KEYS UPDATE.md`). Реализовывать только после того, как базовая игра полностью готова.
- **Унификация ботов и игроков**: частично сделано — общий реестр `ParticipantManager` с единым числовым пространством id и классами `Human/BotParticipant`. Остаётся полностью объединить поведение (ввод от WebSocket vs AI) в одну абстракцию.
- **Debug-режим**: инструментов отладки нет, может потребоваться реализация.
