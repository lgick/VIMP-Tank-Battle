# Этап 7: Формат кадра v4/v5 — `angvel` танка и скорости динамики ✅ выполнен

**Объём**: L · **Репозитории**: `vimp` (ядро + JS) · **Зависит от**: —

## Зачем

Предсказание контактов (этапы 9, 10) невозможно без скоростей: чтобы шагнуть
чужой танк или ящик в своей симуляции, клиенту нужны `vx`, `vy`, `angvel`
авторитетного тела. В `tank-battle` формат кадра поднят до **v5** двумя шагами:

- **v4** — блок `dynamics`: флаг `moving` + `vx`/`vy`/`angvel`;
- **v5** — блок `tanks`: `+angvel` (предсказание доворота чужого корпуса
  при контакте, `RemoteTanks`).

`vimp/packages/engine/src/config/opcodes.js:18` держит
`SNAPSHOT_FORMAT_VERSION = 3` — обе версии отсутствуют.

## Что в tank-battle

- `src/config/opcodes.js` — `SNAPSHOT_FORMAT_VERSION = 5` с историей версий
  в комментарии.
- `src/lib/snapshotCodec.js:161-190` — `writeDynamics`:
  ```
  { 'dN': [x, y, angle] | [x, y, angle, vx, vy, angvel] }
  ```
  на строку пишется `id: u8`, `moving: u8`, затем 3 × f32, и **только при
  `moving === 1`** ещё 3 × f32. Покоящиеся тела от хвоста не дорожают.
- `src/lib/snapshotCodec.js:50-82` — `writeTanks`, `angvel` как `data[10]`.
- `readDynamics` (строки 325-340) — зеркальное чтение.
- Тесты: `tests/lib/snapshotCodec.test.js` (+36).

## Что сейчас в движке

Схема кадра — **строго фиксированной ширины**. `packages/engine/core/src/config.rs`:
`BlockSchema { kind, class, fields: Vec<FieldSchema> }`, где `FieldSchema { name, ty, interp }`.
`packages/engine/core/src/snapshot.rs:134` `write_row` пишет ровно
`schema.fields.len()` значений; `BlockKind` — только `Indexed8`, `Indexed32`,
`List16`, `IndexedNoNull8`. Опциональных полей и переменной длины строки нет.

Дополнительно: `packages/engine/core/src/client/interpolator.rs` читает `interp`
**по индексу поля**, не по имени (об этом прямо предупреждает комментарий в
`vimp-tanks/src/config/snapshot.js`) — любой хвост обязан это учитывать.

Текущая игровая схема (`vimp-tanks/src/config/snapshot.js`):
- `m1` (`indexed8`, `hot`) — 10 полей, **`angvel` нет**;
- `c1`/`c2` (`indexedNoNull8`, `hot`) — `x`, `y`, `angle`, **скоростей нет**.

## Два пути

**A. Опциональный хвост (как в tank-battle).** Ввести в схему признак
«поля начиная с индекса N — необязательные, наличие задаёт флаг-байт»
(новый `BlockKind` вида `IndexedNoNull8Opt` либо поле `optionalFrom` в
`BlockSchema`). Экономит трафик на покоящихся телах — ровно ради этого
хвост и вводился. Цена: изменения в `snapshot.rs`, `client/unpack.rs`,
`interpolator.rs` (интерполяция строки, у которой в одном кадре хвост есть,
а в соседнем нет), в JS-валидации схемы и в `devtools/invariants.js`.

**B. Безусловные поля.** Просто добавить `vx`, `vy`, `angvel` в `c1`/`c2` и
`angvel` в `m1`. Схема не меняется структурно, работы в разы меньше. Цена:
+12 байт на каждое покоящееся тело карты в каждом кадре.

**Рекомендация — A.** Мотив хвоста в `tank-battle` записан явно («покоящиеся
от него не дорожают»), а карты вроде `garden` держат заметное число
неподвижных ящиков. Но если этап 9 хочется довести до игры быстрее — B даёт
рабочий результат и оставляет A как отдельную оптимизацию; тогда в этом файле
нужно зафиксировать выбор.

## Шаги (для пути A)

1. `packages/engine/core/src/config.rs` — расширить `BlockSchema`
   признаком опционального хвоста; `validate()` обязан его проверять.
2. `packages/engine/core/src/snapshot.rs` — запись флага и условного хвоста.
3. `packages/engine/core/src/client/unpack.rs` — зеркальное чтение.
4. `packages/engine/core/src/client/interpolator.rs` — поведение при
   несовпадении наличия хвоста между соседними кадрами (в `tank-battle`
   отсутствие хвоста означает «тело покоится», то есть нулевые скорости).
5. `packages/engine/src/config/opcodes.js` — `SNAPSHOT_FORMAT_VERSION` → 5
   (историю версий перенести комментарием); проверить `ENGINE_API_VERSION` —
   если меняется форма `snapshot`-схемы в `gameConfig`, поднять и его.
6. `packages/engine/src/devtools/invariants.js:247` — проверка версии кадра.
7. `vimp-tanks/src/config/snapshot.js` — `m1` `+angvel`, `c1`/`c2`
   `+vx/vy/angvel` в опциональном хвосте; `vimp-tanks/core/src/tanks.rs` —
   заполнение новых полей строки.
8. Синхронно: Row-структуры в `packages/engine/core/src/snapshot.rs` привязаны
   к порядку полей позиционно — переставлять существующие поля нельзя.

## Тесты

- Rust: round-trip кадра с хвостом и без; строка с `moving = 0` читается как
  нулевые скорости; порядок полей соответствует схеме.
- Порт `tank-battle/tests/lib/snapshotCodec.test.js`.
- `npm run sim` — инвариант версии кадра (`invariants.js`).

## Готово когда

- `cargo test --workspace` и `npm test` в `vimp` зелёные.
- `npm run sim` в `vimp-tanks` проходит на новом формате.
- Документация: `vimp/docs/{en,ru}/network.md` (раскладка кадра),
  `plugin-api.md` (схема снапшота), `CHANGELOG.md`; при подъёме
  `ENGINE_API_VERSION` — major/minor движка и подъём peer-версии в плагине.

## Риски

- **Ломающее изменение протокола.** Кадр v5 не читается клиентом v3 —
  движок и плагин обязаны выйти согласованной парой.
- Интерполятор читает `interp` по индексу — ошибка в порядке полей проявится
  не исключением, а тихо неверной интерполяцией (типичная для этого движка
  «тихая» поломка, см. `vimp/docs/ai/10-pitfalls.md`).

## Итог

Выбран **путь A** (опциональный хвост) — решение подтверждено разработчиком
2026‑08‑20.

**vimp (движок)**

- `core/src/config.rs` — `BlockSchema.optional_from` (JSON `optionalFrom`) +
  `required_len()`; `SnapshotConfig::validate()` отвергает `optionalFrom`,
  который указывает вне непустого хвоста (`0` и `>= fields.len()`).
  Фикстура `dynamics_schema` расширена до 6 полей с `optionalFrom: 3`.
- `core/src/snapshot.rs` — `write_row` пишет флаг-байт перед строкой и хвост
  только при полной длине переданной строки; `debug_assert` на длину строки.
- `core/src/client/unpack.rs` — зеркальное чтение; **наружу строка всегда
  полной ширины**, отсутствующий хвост добивается нулями (`zero_field`).
  Это и есть ответ на шаг 4: интерполятор, hot-буфер и JS остаются
  фиксированной ширины, а покоящееся тело интерполируется со скоростями 0.
- `core/src/map.rs` — `dynamic_map_data(world, with_velocities)`: движущееся
  тело отдаёт `[vx, vy, angvel]`, покоящееся (sleeping либо ниже
  `REST_VELOCITY_EPSILON = 0.01`) — только трансформацию.
- `core/src/game.rs` — `with_velocities` выводится из схемы набора карт
  (`optionalFrom` задан), движок не навязывает игре ширину строки.
- `src/config/opcodes.js` — `SNAPSHOT_FORMAT_VERSION = 5` (история версий
  комментарием). `ENGINE_API_VERSION` **остаётся 3**: `optionalFrom`
  аддитивен, схема существующей игры валидна и дальше, а кадр всегда пакует
  и распаковывает одно и то же ядро плагина по одной и той же схеме —
  разъехаться паре версий негде. Поднятый номер, наоборот, ломает релиз:
  движок гоняет `npm run sim` на **опубликованной** игре из реестра
  (`node_modules/@vimp-games/tanks`), а её манифест несёт старый `engineApi`.
  `devtools/invariants.js` правки не потребовал — версия там сверяется с
  константой; поправлен только фикстур `tests/devtools/invariants.test.js`,
  который хардкодил `3`.
- Версии: крейт `0.5.0 → 0.6.0`, npm `0.11.1 → 0.12.0`, обновлён снимок
  пинов `create-vimp-game`; CHANGELOG обоих пакетов; документация
  `docs/{en,ru}/network.md` и `plugin-api.md`.

**vimp-tanks (плагин)**

- `src/config/snapshot.js` — `m1` `+angvel` (`interp: 'lerp'` — это
  скорость, не угол), `c1`/`c2` `+vx/vy/angvel` с `optionalFrom: 3`.
- `core/src/tank.rs` / `core/src/tanks.rs` — `angvel` в строке снапшота.
- `core/src/client/predictor.rs` + `client/mod.rs` — `RenderState.angvel`
  и 13‑е значение predicted-хвоста hot-буфера (порядок полей после `gameId`
  обязан совпадать со схемой `m1`).
- Тесты: новый `dynamic_box_ships_velocity_tail_only_while_moving`
  (`core/tests/sim.rs`), обновлены фикстуры схем и индексная арифметика
  hot-буфера в `tests/core/*.test.js`.
- CHANGELOG, `docs/{en,ru}/{core,configuration}.md`. Пины на движок
  (`vimp-engine-core` в `core/Cargo.toml`, `vimp-engine` в `package.json`)
  руками НЕ трогаются: их переписывает `scripts/release.js` движка
  (`release/steps.js`, `publishGame`) уже после публикации крейта и npm-пакета.
  Правка их заранее ломает релиз: фаза снятия линков делает `npm install`
  из реестра и падает с `ETARGET` на ещё не опубликованной версии.

**Проверено**: `npm run sim` движка зелёный и на опубликованной игре 0.8.0
(старая схема), и на локальной новой — форматы v3 и v5 самосогласованы внутри
своей пары. `cargo test --workspace` и `npx vitest` в `vimp` (112 + 1423),
`cargo test --workspace` и `npx vitest` в `vimp-tanks` (46 + 14 + 162),
`npm run sim` — `fieldWidths`, `hotLayout`, `frameFormat` зелёные на новом
формате. Rust-часть плагина проверялась через временный
`[patch.crates-io] vimp-engine-core = { path = ... }`, снятый после прогона.

**Релиз**: `npm run release` в `vimp` публикует `vimp-engine-core 0.6.0` и
`vimp-engine 0.12.0`, затем сам переставляет пины плагина и выпускает
`@vimp-games/tanks 0.9.0`. До публикации `cargo build` в плагине собирается
только через временный `[patch.crates-io]` — это ожидаемо.
