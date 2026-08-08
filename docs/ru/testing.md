# Тесты: паттерны и покрытие

Стек, два проекта Vitest и команды запуска описаны в [getting-started.md](getting-started.md#тесты). Эта страница — о том, **как** пишутся тесты в проекте: обязательное правило, карта покрытия и паттерны, которых нужно придерживаться при добавлении тестов.

## Обязательное правило

После добавления или изменения кода проверяйте актуальность тестов и обновляйте их: покрывайте новый код, правьте или удаляйте устаревшие. Любое изменение завершается зелёными

```bash
npx eslint .
npm test
npx vite build
```

Сборка входит в чек-лист не случайно: она ловит битые импорты и недоступные экспорты — vite-node под Vitest их не линкует строго, а ESLint межмодульные экспорты не проверяет.

## Карта покрытия

Покрыто (~815 тестов):

- вся логика `lib/` (включая `security`, round-trip `snapshotCodec` и `raycast`);
- клиент: `SnapshotInterpolator`, `TankPredictor`, `ShotPredictor`, `OwnTank`, модели (Chat, Vote, Controls, Stat, Panel, Auth, Game, CanvasManager), `InputListener`, `SoundManager`, все 8 контроллеров и view (DOM через happy-dom);
- **паритет-тест** `tests/server/TankPredictorParity.test.js` — реплика движения против реального Rapier; обязателен к прогону при любой правке `Tank.updateData`/`models.js`;
- серверные модули с логикой: Stat, Vote, RTTManager, SnapshotManager, Panel, Chat, TimerManager, Pathfinder, SpatialManager, NavigationSystem, HitscanService, BaseModel, Bomb, Map, Tank, BotManager, BotController, SocketManager, Game, VIMP;
- реестр участников (`ParticipantManager`) и менеджеры из `core/` (`VoteCoordinator`, `RoundManager`, `CommandProcessor`);
- **интеграционный слой** (`tests/server/integration/`): полный жизненный цикл VIMP с реальными модулями + протокольный слой `socket/index.js`.

Не покрыто (низкий ROI для юнит-тестов): Pixi-`parts/` и `parts/effects/`, провайдеры (`BakingProvider`/`DependencyProvider`). Исключение — применение данных внутри part'а (не отрисовка): `Bomb.update` покрыт `tests/client/parts/Bomb.test.js` с моком `pixi.js`.

## Паттерны

**Синглтоны** (Game, Vote, Stat, Map, Panel, TimerManager, HitscanService, SnapshotManager, клиентские `*Model`, InputListener) изолируются через `vi.resetModules()` в `beforeEach` + динамический `await import(...)`.

**Rapier под Vitest работает**: WASM инициализируется top-level await в `src/server/physics/rapier.js`, поэтому реальные `World`/`RigidBodyDesc`/`ColliderDesc` доступны и в node-тестах, а `vi.resetModules()` переинициализирует WASM без заметного замедления. Но синхронный бесконечный цикл в тестируемом коде вешает весь прогон — при зависании ищите infinite loop в коде, а не в конфиге Vitest.

**Физические части** (Tank, Bomb, Map, Game) тестируются с моками `world`/`body`/`panel` (Rapier-имена: `createRigidBody`/`createCollider`/`translation`/`linvel`/`applyImpulse`/`castRay`/`collidersWithAabbIntersectingAabb`); реальная физика не симулируется. Дескрипторы — реальные (`RAPIER.RigidBodyDesc`/`ColliderDesc` из `physics/rapier.js`), геометрия проверяется по их полям (`desc.translation`, `collider.shape.halfExtents`).

**Тяжёлые синглтоны с громоздким конструктором** (VIMP) тестируются двумя способами: изолированные методы — через прототип, `Class.prototype.method.call(fakeThis, ...)` (юнит); оркестрация — интеграционно.

**Интеграционные тесты** (`tests/server/integration/`) строят реальный VIMP со всеми реальными модулями + `FakeSocketManager` (пишет wire-кадры) через общий `harness.js`. Бинарные snapshot-кадры (`sendShot`) декодируются реальным `unpackFrame`: `lastShot` возвращает `[snapshot, camera, serverTime, seq]` — это даёт end-to-end покрытие бинарного пути. Критичные моменты:

- `vi.useFakeTimers()` **до** конструктора VIMP (тот стартует таймеры и игровой цикл);
- игровой цикл двигать прямыми вызовами `vimp._onShotTick(dt)`, а не `advanceTimers`;
- `process.nextTick`-колбэки (createUser, security.origin) ждать через `await nextTick()`;
- протокольный слой (`socket/index.js`) тестируется через `vi.doMock('ws', ...)` + фейковый `ws`/`req` (origin `https://localhost:3000` проходит dev-allowlist);
- детерминизм физики: ассертить факт/направление, а критичные исходы (kill) гнать через реальный `Game.applyDamage`.

**Имена методов-моков** с двумя заглавными подряд (например, из внешнего API) задавайте вычисляемым/строковым ключом — иначе сработает ESLint-правило `no-consecutive-caps`.

## Поведение, зафиксированное тестами

Не блокеры, но учитывайте при доработках:

- `CanvasManager.resize` при `fixSize` отдаёт `height` строкой;
- `waiting.getNext` возвращает `undefined` (не `null`) при пустой очереди;
- `sanitizeMessage` — не XSS-защита (экранирование на выводе: `textContent` для текста, `setAttribute` для имени); удаляет только управляющие символы и возвращает `''` для не-строк;
- `validateAuth` непоследователен: ранний `return` для missing/non-string vs накопление ошибок валидаторов.
