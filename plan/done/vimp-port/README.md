# Перенос исправлений tank-battle → vimp-tanks / vimp-engine

## Контекст

`tank-battle` — исходная монолитная игра (авторитетный Node.js-сервер + Rapier,
PixiJS-клиент, WebSocket). В июле 2026 она была перенесена на движок VIMP в виде
плагина `@vimp-games/tanks` (репозиторий `/Users/dmitry/Sites/my/vimp-tanks`,
сейчас 0.7.1). Перенос состоялся и функционально полон: геймплей повторён один
в один, карты `canopy`/`garden`/`pool_mini` побайтно идентичны, а местами плагин
уже впереди (`/rank`, `/like`, auth-сервис, standalone-запуск, Pixi v8
`ParticleContainer`).

Но `tank-battle` продолжил развиваться после форка и **остаётся приоритетной
версией**: с 8 по 16 августа 2026 в него легли исправления физики, стрельбы и
эффектов, которых в плагине нет. Этот план — реестр этих расхождений и порядок
их переноса.

**Направление**: `tank-battle` → `vimp-tanks` (и, где требуется контракт кадра
или примитивы физики, → `vimp-engine`). Обратный перенос не выполняется:
`tank-battle` остаётся источником, а не приёмником правок.

## Куда что уехало при первом переносе

| Слой tank-battle | Где живёт сейчас |
| --- | --- |
| `src/server/parts/` (Tank, Bomb, Map, HitscanService), `src/lib/` (math, vec2, motion, raycast, snapshotCodec) | Rust: `vimp-tanks/core/src/` (5641 строка) + `vimp/packages/engine/core/src/` |
| `src/server/modules/` (VIMP, Game, Vote, Stat, Panel, RTT, Timer, Chat), `src/server/core/`, `src/server/player/` | Движок: `vimp/packages/engine/src/host/meta/` |
| `src/server/modules/bots/` (Pathfinder, NavigationSystem, SpatialManager) | Движок: `vimp/packages/engine/core/src/nav/` + `vimp-tanks/src/host/TanksBotManager.js` |
| `src/client/components/` (MVC), `SnapshotInterpolator`, `InputListener`, `SoundManager`, `logoAnimation` | Движок: `vimp/packages/engine/src/client/` + `core/src/client/interpolator.rs` |
| `src/client/TankPredictor.js`, `ShotPredictor.js` | Rust: `vimp-tanks/core/src/client/predictor.rs`, `client/shot.rs` |
| `src/client/parts/`, `src/client/providers/bakers/` | `vimp-tanks/src/client/parts/`, `src/client/bakers/` |
| `src/config/` (game, client, auth, sounds) | Расщеплён: игровая половина — `vimp-tanks/src/config/`, движковые дефолты — `vimp/packages/engine/src/config/{hostDefaults,clientDefaults}.js` |
| `src/data/` (maps, models, weapons) | `vimp-tanks/src/data/` |

## Точки форка

- **Клиентское ядро** помечено в коде маркером «срез 2.6»
  (`vimp-tanks/core/src/client/predictor.rs:1`, `core/src/lib.rs:66`,
  `vimp/packages/engine/core/src/client/interpolator.rs:2`) — состояние
  `tank-battle` примерно на 2026‑07‑02.
- **Клиентские части и бейкеры** перенесены 2026‑07‑18 («Этап 5») и
  доработаны 2026‑07‑28 (миграция на Pixi v8 `Particle`/`ParticleContainer`).
- Всё, что легло в `tank-battle` **после 2026‑07‑28**, в плагин не попадало —
  кроме двух точечных правок, где первым оказался плагин (`parts/Bomb.js`,
  2026‑08‑08 «bomb bug»; тексты справки в `auth`).

## Этапы

| # | Этап | Репозитории | Объём | Зависит от | Статус |
| --- | --- | --- | --- | --- | --- |
| [1](stage_1.md) | Импульс hitscan не зависит от дальности | vimp-tanks | S | — | ✅ выполнен |
| [2](stage_2.md) | Предиктивные контакты (soft‑CCD) + `brakingFactor` | vimp-tanks, vimp | M | — | ✅ выполнен |
| [3](stage_3.md) | Единый бейкер размытого круга | vimp-tanks | M | — | ✅ выполнен |
| [4](stage_4.md) | Масштабирование эффектов взрыва по радиусу оружия | vimp-tanks | L | 3 | ✅ выполнен |
| [5](stage_5.md) | Воронка: доля радиуса и владение контроллером | vimp-tanks | M | 3, 4 | ✅ выполнен |
| [6](stage_6.md) | Rust‑примитивы столкновений (`collision` + `rigidBody`) | vimp | L | — | ✅ выполнен |
| [7](stage_7.md) | Формат кадра v4/v5: `angvel` танка и скорости динамики | vimp | L | — | ✅ выполнен |
| [8](stage_8.md) | `PredictedSet`: каркас предсказанного мира | vimp-tanks | L | 2, 6 | ✅ выполнен |
| [8a](stage_8a.md) | Хуки движка: сырой кадр в реконсиляции + рендер-строки игры | vimp, vimp-tanks | M | 8 | ✅ выполнен |
| [9](stage_9.md) | `MapDynamics`: предсказание динамики карты | vimp-tanks, vimp | L | 7, 8, 8a | ✅ выполнен |
| [10](stage_10.md) | `RemoteTanks`: предсказание чужих танков в контакте | vimp-tanks | L | 7, 8, 8a | ✅ выполнен |
| [11](stage_11.md) | `ShotPredictor`: sim‑боксы и якорь попадания | vimp-tanks, vimp | M | 9 | ✅ выполнен |

Этап 8a выделен шагом 4 этапа 8 (см. [stage_8.md](stage_8.md#вынесено-отдельным-пунктом-шаг-4-правка-движка)):
контракт `GameClientDef` не давал игре ни сырого кадра в момент
реконсиляции, ни возможности перекрыть интерполированные строки рендера.
Закрыт — подробности в [stage_8a.md](stage_8a.md).

**Требует публикации `vimp-engine-core`** (следующий минор) и правки версии
в `vimp-tanks/core/Cargo.toml`: этап 9 добавил движку `ClientState::game()`,
и до публикации в `vimp-tanks/Cargo.toml` живёт временный
`[patch.crates-io]` на локальный чекаут движка.

Объём: **S** — правка значения/строки; **M** — несколько файлов одного слоя с
тестами; **L** — Rust‑ядро плюс JS, либо изменение контракта.

## Что переносить НЕ нужно

Проверено и подтверждено — расхождение объясняется расщеплением «движок ↔ игра»,
а не отставанием:

- `timers`, `rtt`, `idleKickTimeout`, `maxPlayers`, `chatMaxLength`, `isDevMode`
  из `tank-battle/src/config/game.js` → `vimp/packages/engine/src/config/hostDefaults.js`.
- `interpolation`, `dynamicCamera`, `chat.elems/listLimit/lineTime/cache*`,
  `panel.elems`, анимация полосы здоровья → `vimp/packages/engine/src/config/clientDefaults.js`
  и `src/client/components/view/Panel.js`.
- `src/config/wsports.js` — идентичен движковому.
- `src/config/gamecodes.js` — то же содержимое, отличается только форма экспорта.
- `src/config/sounds.js`, `src/data/maps/*` — **идентичны** плагину.
- `src/client/views/*.pug` — движок держит нейтральный каркас, игровые тексты
  приезжают данными (`vimp-tanks/src/config/auth.js`, `texts.sections`).
  Коммит `fdd43e7` (2026‑08‑16, регистр подсказок) в плагине **уже есть** —
  он там появился раньше.
