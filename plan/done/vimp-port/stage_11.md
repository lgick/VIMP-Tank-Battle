# Этап 11: `ShotPredictor` — sim-боксы и якорь попадания ✅ выполнен

**Объём**: M · **Репозитории**: `vimp-tanks`, `vimp` · **Зависит от**: этап 9

## Зачем

Локально предсказанный трассер должен попадать туда же, куда попал хост.
Две правки из `tank-battle` (`536b1ae`, `5b34f0c`, `73df878`):

1. **Raycast строится по симуляционным боксам динамики карты**, а не по
   рендерным — по той же причине, по которой выстрел строится из
   `TankPredictor.getSimState()`, а не из рендерного состояния: иначе локальное
   попадание расходится с серверным.
2. **Якорь попадания в динамику.** Ящик может уехать за 45–80 мс анимации
   трассера. Точка удара пересчитывается из **текущего** трансформа ящика,
   а не из того, что было в момент выстрела, — иначе облако осколков окажется
   позади уехавшего ящика. Дальше осколки остаются лежать на месте: за ящиком
   они не следуют (`ImpactEffect` работает в мире).

Якорь передаётся девятым элементом строки трассера — **только у своих локально
предсказанных**. Серверные трассеры (длина 8) его не несут, `data[8] === undefined`.

## Что в tank-battle

- `src/client/ShotPredictor.js` — `_buildTracer` кладёт девятым элементом
  `[anchorKey, anchorLocalX, anchorLocalY]`; raycast идёт по `getSimBoxes()`.
- `src/client/parts/effects/shot/ShotEffectController.js:19-29, 88-121` —
  чтение якоря, зависимость `dependencies.mapDynamics`, пересчёт
  `impactX`/`impactY` из текущего трансформа бокса.
- `src/client/parts/effects/shot/ImpactEffect.js` — приём пересчитанной точки.
- `src/config/client.js` — `componentDependencies.mapDynamics: ['ShotEffect']`.
- Тесты: `tests/client/ShotPredictor.test.js` (+130 по коммитам),
  `tests/client/parts/effects/ShotEffectController.test.js` (220 строк, новый).

## Что сейчас в плагине

- `vimp-tanks/core/src/client/shot.rs` (1141 строка) — предсказание трассера
  среза 2.6, без динамики карты в луче.
- `vimp-tanks/src/client/parts/effects/shot/ShotEffectController.js` — якоря
  нет, `dependencies.mapDynamics` нет, точка удара берётся как есть
  (`this.endPositionX/Y`).

## Шаги

1. `core/src/client/shot.rs` — вести луч по `get_sim_boxes()` из `MapDynamics`
   (этап 9) наравне со стенами; при попадании в ящик вычислить локальные
   координаты точки в его фрейме (`to_local`).
2. Расширить строку трассера девятым элементом. **Проверить**, как это ложится
   на схему `w1` (`vimp-tanks/src/config/snapshot.js`, `list16`, 8 полей):
   у `tank-battle` девятый элемент существует только в локальной строке и в
   кадр не пишется — в VIMP локальные предсказанные строки идут через
   hot-буфер (`HOT_HAS_PREDICTED`, `vimp/packages/engine/core/src/client/mod.rs:17`),
   а не через схему кадра. Убедиться, что расширение не задевает формат кадра;
   если задевает — этап зависит ещё и от этапа 7.
3. `src/config/client.js` — объявить `mapDynamics: ['ShotEffect']`.
4. `ShotEffectController.js` — чтение якоря, пересчёт точки удара из текущего
   трансформа бокса, аккуратный `null`-путь для серверных трассеров.
5. `ImpactEffect.js` — принять пересчитанную точку.

## Тесты

- Порт `tests/client/parts/effects/ShotEffectController.test.js` целиком —
  он написан ровно под этот случай (серверный трассер без якоря, свой трассер
  с якорем, уехавший ящик).
- Порт добавленных случаев `tests/client/ShotPredictor.test.js`.

## Готово когда

- `cargo test --workspace`, `npm test` зелёные.
- `npm run dev`: выстрел в едущий ящик — осколки на ящике, не позади него;
  выстрел чужого игрока (серверный трассер) отрабатывает как раньше.
- Документация: `vimp-tanks/docs/{en,ru}/core.md`; при изменении формата
  строки — `vimp/docs/{en,ru}/network.md`.

## Риски

Якорь — необязательный элемент строки. Потребитель обязан различать «своя
предсказанная строка» и «серверная»; иначе на серверных трассерах будет
`undefined` там, где ждут массив, — и осколки перестанут рисоваться вовсе.

## Как сделано

- `core/src/client/remote_tanks.rs` — `sim_boxes()` (корпуса по `gameId` в том
  виде, в каком их видит хост) и `to_render_point()` (перенос точки из
  симуляционного фрейма корпуса в рендерный), плюс приватный `sim_obb`
  (predicted → своё состояние, follow → последний авторитетный кадр).
  `Predictor::remote_tanks()` — иммутабельный доступ к подсистеме.
- `core/src/client/shot.rs` — собственной геометрии динамики карты больше нет
  (`dynamic_sizes`/`dynamic_states` удалены вместе с чтением блока `cN`):
  луч идёт по `ShotWorld { dynamics, remote_tanks }`, который на время
  выстрела отдаёт `TanksClient::try_action`. `cast_ray` возвращает не только
  дистанцию, но и цель (`RayTarget::Wall/Dynamic/Tank`); `build_tracer` кладёт
  девятым элементом якорь `[key, localX, localY]` и переносит конец трассера
  в рендерный фрейм задетого ящика (`to_world`) или корпуса
  (`to_render_point`).
- **Формат кадра не задет** (шаг 2): локальная строка трассера уходит JSON'ом
  спавна (`try_action` → `applyGameData`), схемы `w1` (`list16`, 8 полей) она
  не касается — зависимости от этапа 7 не возникло.
- Движок (`vimp`): необязательный хук `ClientPlugin.hooks.services(core)` —
  игровые сервисы подмешиваются в `availableServices` перед движковыми
  (`packages/engine/src/client/main.js`). Без него игровой сервис в пул было
  не положить, а движок не должен знать имени `mapDynamics` (см. «Осталось
  за границей этапа» в [stage_9.md](stage_9.md)).
- `vimp-tanks/src/client/index.js` — сервис `mapDynamics` с
  `toWorld(key, localX, localY)` поверх `ClientCore.map_dynamics_to_world`;
  математику фрейма считает ядро, а не JS.
- `ShotEffectController.js` — чтение якоря (`Array.isArray(data[8])`),
  пересчёт точки удара из текущего трансформа ящика, откат к мировой точке
  для авторитетных трассеров и когда сервиса/ящика нет.
  `ImpactEffect.js` — комментарий о мировых координатах осколков.
- `src/config/client.js` — `mapDynamics: ['ShotEffect']` уже был объявлен
  этапом 9, правки не потребовал.
- Тесты: 7 новых Rust-тестов (4 в `shot.rs`, 3 в `remote_tanks.rs`) —
  `cargo test --workspace` 143 зелёных; порт
  `tests/client/parts/effects/ShotEffectController.test.js` (7 случаев) —
  `npm test` 169 зелёных, `npm run sim:scenarios` — 4 сценария зелёные.
  В движке `npm test` 1424 зелёных.
- Документация: `vimp-tanks/docs/{en,ru}/core.md` (раздел «Мир raycast'а
  выстрела»), `architecture.md`, `configuration.md`;
  `vimp/docs/{en,ru}/plugin-api.md` и `client.md` (хук `services`).

## Осталось за границей этапа

- Проверка `npm run dev` вживую (выстрел в едущий ящик, чужой трассер) —
  за разработчиком: автоматических сценариев на визуал нет.
