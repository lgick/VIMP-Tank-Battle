# Этап 4: Масштабирование эффектов взрыва по радиусу оружия ✅ выполнен

**Объём**: L · **Репозитории**: `vimp-tanks` · **Зависит от**: этап 3

## Зачем

Геометрия султана дыма и облака осколков была зашита константами, подобранными
под единственную бомбу (`w2`, `radius: 50`). Оружие с другим радиусом взрыва
рисовалось бы точно таким же облаком. В `tank-battle` введена эталонная величина
`REFERENCE_BLAST_RADIUS = 50`, от которой считается `blastScale = radius / 50`:
**габариты** масштабируются пропорционально, а **времена жизни и прозрачность
остаются** — они задают характер эффекта, а не его размер.

Вместе с этим размеры частиц переведены из «долей текстуры» в **юниты мира**
и нормируются по `contentSize` бейкера (этап 3), то есть перестают зависеть от
силы размытия.

Коммиты: `44d52e7`, `111dfcb`, `809ae21`, `bac6560`, `b7f7500` (2026‑08‑08).

## Что в tank-battle

- `src/client/parts/effects/explosion/SmokeEffect.js` — `REFERENCE_BLAST_RADIUS`
  (экспортируется), `constructor(assets, radius = REFERENCE_BLAST_RADIUS)`,
  `_blastScale`, `_unitScale = 1 / contentSize`, размеры
  `_minStartSize`/`_maxStartSize`/`_minTargetSize`/`_maxTargetSize` и смещения
  `_initialOffsetX/Y` — все умножены на `blastScale`.
- `src/client/parts/effects/explosion/ExplosionEffect.js`,
  `ExplosionEffectController.js` — передача радиуса вниз.
- `src/client/parts/effects/shot/ImpactEffect.js` — та же нормировка для осколков.
- `src/client/parts/Smoke.js` — дым повреждённого танка (89 строк расхождения).
- Тесты: `tests/client/parts/effects/SmokeEffect.test.js`,
  `tests/client/parts/effects/ExplosionEffectController.test.js`.

## Что сейчас в плагине

- `SmokeEffect` принимает только `assets`, размеры заданы как `_minStartScale`
  (0.02…0.05) — доли текстуры, а не юниты мира; `_initialOffsetX/Y = 15` без
  масштаба; `BOUNDS_WIDTH/HEIGHT = 400/800` — фиксированная область разлёта.
- Радиус взрыва в эффект не доходит вообще.

## Главное препятствие

**Плагин мигрировал частицы на Pixi v8, `tank-battle` — нет.** Копировать файлы
нельзя, переносить надо семантику:

| | tank-battle | vimp-tanks |
| --- | --- | --- |
| Частица | `Sprite` (`ParticlePool` → `new Sprite(texture)`) | `Particle` (`new Particle({ texture, anchorX, anchorY })`) |
| Контейнер | обычный `Container` | `ParticleContainer` с `dynamicProperties` и `boundsArea` |
| Масштаб | `sprite.scale.set(v)` | `particle.scaleX` / `particle.scaleY` |
| Якорь | `sprite.anchor.set(0.5)` | `anchorX` / `anchorY` в конструкторе |
| Снятие со сцены | `sprite.parent.removeChild` внутри `release()` | вызывающий обязан сам `container.removeParticle` |

Реализация плагина — осознанное улучшение производительности, её надо
**сохранить**. Значит: берём из `tank-battle` формулы и константы, оставляем
плагиновый механизм частиц.

Отдельный пункт — `boundsArea` (`BOUNDS_WIDTH/HEIGHT`): при масштабировании по
радиусу она обязана масштабироваться тоже, иначе `ParticleContainer` начнёт
отсекать частицы крупного взрыва.

## Шаги

1. `SmokeEffect`: ввести `REFERENCE_BLAST_RADIUS`, принять `radius` в конструктор,
   посчитать `blastScale`; перевести размеры в юниты мира через
   `_unitScale = 1 / contentSize` (бейкер из этапа 3); умножить габариты и
   смещения на `blastScale`; **не трогать** времена жизни и альфу.
2. `boundsArea` `ParticleContainer` — умножить на `blastScale`.
3. Провести радиус по цепочке `ExplosionEffectController` → `ExplosionEffect`
   → `SmokeEffect` (радиус приходит в блоке `w2e`, поле `radius`,
   `vimp-tanks/src/config/snapshot.js`).
4. `ImpactEffect` — та же нормировка по `contentSize`.
5. `src/client/parts/Smoke.js` (дым повреждённого танка) — сверить с
   `tank-battle` и перенести расхождение по той же схеме.
6. Сверить `src/config/client.js` — параметры бейков и эффектов.

## Тесты

Перенести `tests/client/parts/effects/SmokeEffect.test.js` и
`ExplosionEffectController.test.js`, адаптировав под `Particle`/`ParticleContainer`.
Ключевые утверждения: удвоение радиуса удваивает габариты и не меняет времена
жизни; `contentSize` меняет масштаб, а сила размытия — нет.

## Готово когда

- `npm test`, `npx eslint .` зелёные.
- `npm run dev`: взрыв бомбы визуально совпадает с `tank-battle` (сверять
  запуском обеих игр рядом).
- Документация: `vimp-tanks/docs/{en,ru}/extending.md` (добавление оружия —
  радиус теперь влияет на эффект).

## Риски

Самый визуально заметный этап. Расхождение «на глаз» между двумя механизмами
частиц (Sprite vs Particle) возможно даже при верных формулах — сверку делать
на одинаковых картах и одинаковом зуме.
