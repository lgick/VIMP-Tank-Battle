# Этап 8a: хуки движка — сырой кадр в реконсиляции и рендер-строки игры ✅ выполнен

**Объём**: M · **Репозитории**: `vimp` (ядро + JS), `vimp-tanks` (проводка) ·
**Зависит от**: этап 8

## Зачем

Шаг 4 этапа 8 требовал проверить, достаточно ли контракта `GameClientDef`,
чтобы игра вела дополнительные тела. Оказалось — нет, две дыры:

1. **Нет сырого кадра в момент реконсиляции.** `ClientState::push_frame`
   отдавал игре только `player.state`, а `PredictedSet.beginReconcile`
   читает из кадра тела динамики карты и чужих танков.
2. **Некуда отдать рендер-блок.** `write_hot` писал строки только из
   интерполяции, а игре оставлял единственный непрозрачный хвост
   `RenderOverlay.tail` (свой актор).

Без обеих подсистемы этапов 9 и 10 не подключить.

## Что сделано в `vimp`

`packages/engine/core/src/client/game.rs`:

- Три метода `GameClientDef` с пустым дефолтом (старые игры не трогаются):
  `begin_reconcile(&DecodedSnapshot)` — авторитетный кадр ДО replay,
  `finish_reconcile()` — сразу после `on_server_state`,
  `render_rows() -> Vec<PredictedRow>` — строки рендер-тика.
- `push_frame` зовёт `begin_reconcile` до `interpolator.push` (кадр там
  переходит во владение буфера) и `finish_reconcile` после
  `on_server_state`. Порядок тот же, что в `tank-battle/src/client/main.js`.
- `PredictedRow { key_id, id, fields }`. `write_hot` дописывает строки
  после predicted-хвоста в том же формате записи и приводит ширину к схеме
  ключа (лишние поля отбрасываются, недостающие — нули); неизвестный
  `key_id` пропускается, иначе одна кривая запись сдвинула бы разбор всего
  хвоста.

`packages/engine/src/lib/reconstructHot.js`: вместо «если флаг PREDICTED —
прочитать одну запись» хвост читается до конца буфера. Механизм перекрытия
не менялся: запись кладётся в `game[key][id]`, поэтому последняя побеждает —
ровно так уже работал predicted-хвост своего актора. Инвариант
`consumed === hot.length` (`devtools/invariants.js`) сохранён.

Тесты: 3 в `client/game.rs` (порядок `begin → state → finish`; кадр без
player-блока хуков не запускает; строки идут после хвоста, ширина
приводится к схеме, неизвестный ключ отсеивается; дефолт — пусто) + 1 в
`tests/lib/reconstructHot.test.js` (несколько хвостовых записей перекрывают
интерполированные в обеих группах).

Документация: `docs/{en,ru}/core.md`, `docs/{en,ru}/plugin-api.md`,
`docs/{en,ru}/client.md`, `docs/ai/05-wasm-core.md`,
`docs/ai/06-snapshot-protocol.md`. Журналы: `packages/engine/core/CHANGELOG.md`
и `packages/engine/CHANGELOG.md` — оба `### Added` (минор).

## Что сделано в `vimp-tanks`

- `PredictedRow` теперь движковый (`vimp_engine_core::client::game`),
  локальный тип из `predicted_set.rs` убран.
- `TanksClient` реализует три хука и переадресует их подсистемам,
  зарегистрированным в предикторе (`Predictor::predicted_sets`/`_mut`).
- Тест проводки в `core/src/client/mod.rs`: двойник подсистемы получает
  `begin`/`finish` в правильном порядке, а его строки уезжают из
  `render_rows()` без изменений.
- Документация: `docs/{en,ru}/core.md` — абзац «движкового хука нет»
  заменён описанием готовой трубы.

## Проверено

`vimp`: `cargo test --workspace` 115 ✓, `npx eslint .` ✓, `npm test` 1424 ✓.
`vimp-tanks`: `cargo test --workspace` 81 ✓, `npx eslint .` ✓, `npm test`
162 ✓, `npm run build` ✓, `npm run sim:scenarios` — 0 падений
(`hotLayout`, `finiteValues`, `predictionDrift` зелёные),
`vimp-contract.js --game ../vimp-tanks` — 0 падений.

## Осталось разработчику (публикация)

Ядро движка ушло вперёд published-версии: `vimp-tanks` собирается только
против нового крейта. Пин поднимает сам релиз-скрипт — `publishGame`
получает `crateVersion`, переписывает `vimp-engine-core = "X.Y.Z"` в
`core/Cargo.toml` и делает `cargo update --precise`, — и происходит это
строго после публикации крейта (`publishCrate` идёт первым шагом). Поэтому
никакого `[patch.crates-io]` в игре быть не должно: preflight его отбивает
(`findCratePatches`), а опубликованное ядро оказалось бы собрано против
крейта, которого нет ни у кого.

Порядок: `npm run release` в `vimp` — крейт публикуется следующим минором
(`### Added` в `packages/engine/core/CHANGELOG.md`), затем игра
пересобирается уже на нём.

**До релиза локально `vimp-tanks` не соберётся** (`cargo`/`npm run build`
упрутся в отсутствие `PredictedRow` в опубликованном 0.6.0) — это
ожидаемо и лечится самим релизом. Если ядро нужно погонять локально до
публикации, патч добавляется временно и **снимается перед коммитом**
(`vimp-tanks/docs/en/getting-started.md`).
