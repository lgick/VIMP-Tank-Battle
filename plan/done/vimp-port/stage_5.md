# Этап 5: Воронка — доля радиуса и жизненный цикл контроллера ✅ выполнен

**Объём**: M · **Репозитории**: `vimp-tanks` · **Зависит от**: этапы 3, 4

## Зачем

Две независимые правки, легшие в `tank-battle` коммитами `eff8ab7` и `5b8e4c2`
(2026‑08‑08 / 09):

1. **Воронка масштабируется вместе с оружием.** Диаметр видимого следа задан
   долей от радиуса взрыва (`FUNNEL_TO_BLAST_RATIO = 0.168`, подобрана под
   эталонную бомбу), а не абсолютной константой. Дым внутри воронки получает
   тот же радиус: `new SmokeEffect(this._assets, this._radius)`.
2. **Контроллер перестал плодить дубли и падать на пустой сцене.** Появились
   гард `_isStarted` (повторный `run()` поднимал вторую пару «вспышка + воронка»
   поверх первой, теряя ссылки на первую — она оставалась висеть на сцене и
   в тикере) и ранний выход, когда сцену очистили до старта (контроллер
   уничтожает только завершение воронки, которой в этом случае не будет —
   иначе он жил бы вечно). Плюс гард радиуса: `data[2] ?? REFERENCE_BLAST_RADIUS`
   избавляет вспышку, воронку и дым от `NaN`, если хост радиус не прислал.

## Что в tank-battle

- `src/client/parts/effects/explosion/FunnelEffect.js` — `FUNNEL_TO_BLAST_RATIO`,
  `FUNNEL_BASE_ALPHA`, `FUNNEL_SIZE_JITTER`, конструктор принимает `radius`
  и прокидывает его в `SmokeEffect`.
- `src/client/parts/effects/explosion/ExplosionEffectController.js` —
  `_isStarted`, гард `if (!this.parent) { this.destroy(); return; }`,
  `this.radius = data[2] ?? REFERENCE_BLAST_RADIUS`, `explosion.zIndex = 4`.
- `src/client/parts/effects/explosion/ExplosionEffect.js` — минус 30 строк:
  часть ответственности за воронку ушла в контроллер.
- `src/config/client.js` — параметры бейка воронки: `baseRadius: 25`,
  `irregularity: 4`, `blur: 3`, `numPoints: 20`, `colorFill: 0x1c1c1c`,
  `colorRim: 0xb0b0b0`, `rimWidth: 4`, `variants: 5` — с комментариями,
  почему именно такие.
- Тест: `tests/client/parts/effects/ExplosionEffectController.test.js`.

## Что сейчас в плагине

- `FunnelEffect` — версия от 2026‑07‑18 («Этап 5» первого переноса), радиуса
  не знает, дым создаёт без него.
- `ExplosionEffectController` — без `_isStarted`, без гарда `parent`, без гарда
  радиуса; порядок создания эффектов другой (`funnel` до `explosion`,
  `funnel.zIndex = 2`), `parentContainer` берётся в локальную переменную.
- `src/config/client.js` — параметры воронки: `irregularity: 5`, `blur: 40`,
  `numPoints: 12`, без `colorFill`/`colorRim`/`rimWidth`/`variants`.
  **`blur: 40` против `blur: 3`** — расхождение на порядок; в `tank-battle`
  комментарий объясняет, что сильнее ~1/4 радиуса пятно размазывается на весь
  холст и бортик перестаёт читаться. Похоже, версия плагина визуально другая.
- `funnelTexture.js` расходится (73 строки) — вероятно, вариант без бортика.

## Шаги

1. Сверить `funnelTexture.js` целиком: если плагиновая версия — предок
   tank-battle‑овской, заменить её; параметры перенести в `src/config/client.js`
   вместе с комментариями.
2. `FunnelEffect`: принять `radius`, ввести `FUNNEL_TO_BLAST_RATIO`,
   передать радиус в `SmokeEffect` (доступно после этапа 4).
3. `ExplosionEffectController`: перенести `_isStarted`, гард `parent`, гард
   радиуса, порядок и `zIndex` создания эффектов.
4. `ExplosionEffect`: снять с него то, что переехало в контроллер.

## Тесты

Перенести `tests/client/parts/effects/ExplosionEffectController.test.js`
(в `tank-battle` он правился всеми тремя коммитами — брать финальную версию).
Ключевые случаи: повторный `run()` не создаёт второй пары; `run()` без
`parent` уничтожает контроллер; отсутствующий `data[2]` не даёт `NaN`.

## Готово когда

- `npm test`, `npx eslint .` зелёные.
- `npm run dev`: воронка от бомбы читается, не размазана на весь холст, бортик
  виден на тёмной карте; после смены карты не остаётся висящих эффектов.
- Документация: `vimp-tanks/docs/{en,ru}/extending.md`, `configuration.md`.

## Риски

Расхождение `blur: 3` vs `blur: 40` может означать, что бейк воронки в плагине
переделан осознанно, а не отстал. **Перед переносом сравнить визуально** оба
запуска; если плагиновый вариант новее — перенести только пункты 2–4 (радиус
и жизненный цикл), оставив бейк как есть.
