# Этап 1: Импульс hitscan не зависит от дальности оружия ✅ выполнен

**Объём**: S · **Репозитории**: `vimp-tanks` · **Зависит от**: —

## Зачем

Попадание пули отбрасывало динамический ящик тем сильнее, чем дальнобойнее
оружие: импульс строился из вектора луча длиной `range`, а не из нормализованного
направления. Настройки, которая объясняла бы разницу, не существовало — эффект
был побочным следствием формулы. В `tank-battle` исправлено коммитом `536b1ae`
(2026‑08‑11, «hitscan bug»).

## Что в tank-battle

- `src/server/parts/HitscanService.js:36-76` — `impulseMagnitude` берётся из
  конфига как есть; `rayVector` (длиной `range`) используется только для
  каста луча, а импульс строится из нормализованного `direction`.
- `src/data/weapons.js:5-8` — `impulseMagnitude: 7500000` с комментарием, что
  значение подобрано равным старому эффективному импульсу (5000 · 1500).

## Что сейчас в плагине

- `vimp-tanks/core/src/tanks.rs:738-740`:
  ```rust
  if impulse_magnitude > 0.0 && body.is_dynamic() {
      body.apply_impulse_at_point(ray_vector * impulse_magnitude, impact, true);
  }
  ```
  `ray_vector` = `shot.direction * range` (строка 705) — ровно тот баг.
- `vimp-tanks/src/data/weapons.js` — `impulseMagnitude: 5000`.

## Шаги

1. `vimp-tanks/core/src/tanks.rs`: заменить `ray_vector * impulse_magnitude`
   на `shot.direction * impulse_magnitude`, перенести пояснительный комментарий
   из `HitscanService.js:36-39`.
2. `vimp-tanks/src/data/weapons.js`: `impulseMagnitude: 5000 → 7500000`
   с комментарием из `tank-battle/src/data/weapons.js`.
3. Проверить, не масштабируется ли импульс от дальности и во взрыве бомбы
   (`tanks.rs:824` `detonate`) — там радиус, а не `range`, но убедиться стоит.
4. `npm run core:build` (пересборка WASM обеих целей).

## Тесты

- Rust: добавить в `core/tests/sim.rs` (или юнит рядом с `process_hitscan`)
  проверку — при одинаковом `impulse_magnitude` и разных `range` приложенный
  к ящику импульс совпадает. Ориентир: `tank-battle/tests/server/HitscanService.test.js`
  (коммит `536b1ae` добавил туда 26 строк ровно на этот случай).

## Готово когда

- `cargo test --workspace` зелёный, новый тест закрывает независимость от `range`.
- `npm test`, `npx eslint .` зелёные.
- Документация: `vimp-tanks/docs/{en,ru}/gameplay.md` (раздел «Weapons and the
  tank») и `configuration.md` (`weapons.js`) — если там указано значение импульса.

## Результат

Выполнено в `vimp-tanks` (рабочее дерево, не закоммичено):

- `core/src/tanks.rs:747` — импульс строится из `shot.direction`
  (нормализован в `Tank::fire_direction`), а не из `ray_vector`;
  комментарии перенесены из `HitscanService.js`.
- `src/data/weapons.js` — `impulseMagnitude: 7500000` с пояснением.
- `core/tests/sim.rs` — новый тест
  `hitscan_impulse_independent_of_weapon_range`: два ядра с `range` 200 и
  1500 при равном импульсе дают одинаковое смещение ящика. Проверено, что
  тест ловит регрессию: со старой формулой Δx расходится 1220.7 против
  9155.27 (ровно отношение дальностей).
- Документация обновлена в обоих языках: `gameplay.md` (раздел про оружие),
  `configuration.md` (таблица `weapons.js`), `core.md` (перечень сценариев
  `sim.rs`).

Шаг 3 плана (проверка бомбы) — расхождений нет: `TanksSim::detonate`
(`core/src/tanks.rs:894`) строит импульс из нормализованного направления
`(тело − эпицентр)`, масштабируя его только falloff'ом по радиусу.

**Не предусмотренное планом**: фикстуру `flat_config_json()` в
`core/tests/sim.rs` пришлось поднять до `impulseMagnitude: 7500000` — она
документирована как зеркало `src/data/*.js`, и без этого эффективный импульс
в тестах падал в 1500 раз, из-за чего рушились `bots_fight_each_other` и
`hitscan_shot_kills_after_three_hits` (танки — тоже динамические тела,
и отдача от попадания перестала их расталкивать).

## Риски

Ощутимо меняет отбрасывание ящиков ближним оружием. Значение `7500000` подобрано
под `range: 1500` пули — при добавлении оружия с другой дальностью баланс
придётся задавать явно, что и было целью правки.
