# TESTING TODO

Оставшаяся тестовая работа. Базовое покрытие (~344 теста, 38 файлов) уже есть —
вся логика `lib/`, серверные модули с логикой и клиентские модели. Этот файл —
живой список того, что ещё **стоит** покрыть, сгруппированный по ROI.

Соглашения и паттерны тестирования описаны в `CLAUDE.md` → раздел **Testing**.

## Уже покрыто

`lib/*`; server: Stat, Vote, RTTManager, SnapshotManager, Panel, Chat,
TimerManager, Pathfinder, SpatialManager, NavigationSystem, HitscanService,
BaseModel, Bomb, Map, Tank, BotManager, SocketManager, Game, изолированные
методы VIMP; client-модели: Chat, Vote, Controls, Stat, Panel, Auth, Game,
CanvasManager; InputListener; SoundManager (`processAudibility`).

## Осталось

### Tier A.1 — деуглубление геймплейных модулей (высокий ROI)

Добить непокрытые методы уже протестированных модулей (моки `world`/`body`/
`panel` уже отработаны в `Tank.test.js`/`Game.test.js`/`Bomb.test.js`).

- [ ] `Tank.updateData(dt)` — битмаска клавиш, поворот/центрирование башни,
      сборка `_shotData` при `fire`, смена оружия.
- [ ] `Game`: `updateData` (фикс-степ аккумулятор), `_processContactEvents`,
      `getEvents`, `getWorldState`, `_createWeaponAction`.
- [ ] `SoundManager`: `registerSound`/`unregisterSound`/`updateSoundData`/
      `getSoundConfig`/`setListenerPosition` (через прототип).
- [ ] `TimerManager`: игровой цикл `_loopTick`/`_startGameLoop` (fake timers).

### Tier A.2 — клиентские контроллеры

`src/client/components/controller/*.js` (8 файлов): тонкая проводка model↔view
с небольшой логикой (напр. `ChatCtrl.updateCmd`). Моки `model` + `view`
(реальный `Publisher`). Синглтоны → `vi.resetModules()`.

- [ ] Auth, CanvasManager, Chat, Controls, Game, Panel, Stat, Vote

### Tier B — клиентские view (DOM, happy-dom)

`src/client/components/view/*.js` (8 файлов). Засеять `document.body.innerHTML`
нужными id, создать view с фейковым `model`, эмитить события и проверять DOM.
Начать с малых: Controls, CanvasManager, Game.

- [ ] Controls, CanvasManager, Game, Chat, Auth, Vote, Panel, Stat

### Tier D — BotController

`src/server/modules/bots/BotController.js`. Моки `game`/`vimp._bots`/`panel`/
`spatialManager`; `planck` Vec2/Rot реальные. Покрыть: `_setKeyState`,
`releaseAllKeys`, `_updateCachedData`, `findClosestEnemy`, `makeDecision`,
`moveTo`, `calculateNewCombatPosition`, `update` (ветка DEAD), `destroy`.

## Вне scope (unit-тесты нецелесообразны)

- **Pixi-рендеринг**: `src/client/parts/**`, `src/client/providers/**` —
  нужны моки PixiJS renderer; уместнее визуальные/e2e тесты.
- **Entry/IO**: `src/server/socket/index.js`, `src/client/main.js`,
  `src/server/main.js` — на импорте поднимают сервер/`new VIMP(...)`; e2e.
- `_*`-файлы/директории (игнор по правилам), `src/config/*`, `src/data/*`.

## Будущие фичи (тестировать после реализации)

- Бинарный формат снапшотов (порт `5`).
- Client-side prediction / reconciliation.

## Проверка

`npm test` (полный прогон), `npm run test:coverage`, `npx eslint tests/`.
Прицельно: `./node_modules/.bin/vitest run tests/<path>`.
