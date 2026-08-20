# Этап 3: Единый бейкер размытого круга ✅ выполнен

**Объём**: M · **Репозитории**: `vimp-tanks` · **Зависит от**: —

## Зачем

Три бейкера — `explosionTexture`, `smokeTexture`, `impactParticleTexture` —
пекут одну и ту же фигуру: размытый круг, различаются только параметрами.
В `tank-battle` они схлопнуты в один `blurredCircleTexture`, а расчёт запаса
под размытие вынесен в `blurMargin`.

Заодно исправлены два дефекта, которые в плагине остались:

1. **Обрезка размытия.** Без `filter.padding = blurMargin(blur)` Pixi рендерит
   размытие лишь на `2 * strength` вокруг фигуры и обрезает раньше рамки холста —
   у спрайта появляется видимый прямоугольный край.
2. **Масштаб частиц врал.** Бейкер теперь возвращает `{ texture, contentSize }`,
   где `contentSize` — диаметр *нарисованного круга*, без запаса под размытие.
   Потребитель нормирует масштаб по нему, а не по размеру холста — иначе
   при смене силы размытия частица меняла видимый размер.

Исправлено коммитами `44d52e7`, `111dfcb`, `809ae21` (2026‑08‑08).

## Что в tank-battle

- `src/client/providers/bakers/blurMargin.js` — 15 строк, `BLUR_SPREAD_FACTOR = 4`
  с выводом множителя из ядра BlurFilter.
- `src/client/providers/bakers/blurredCircleTexture.js` — 38 строк,
  возвращает `{ texture, contentSize: radius * 2 }`.
- `src/client/providers/bakers/index.js` — три ключа (`explosionTexture`,
  `smokeTexture`, `impactParticleTexture`) ссылаются на один и тот же бейкер.
- `src/config/client.js` — параметры бейков: `quality: 40` у взрыва,
  `quality: 10` у дыма, `quality: 40` у частиц попадания.
- Тесты: `tests/client/providers/bakers/blurMargin.test.js`,
  `tests/client/providers/bakers/blurredCircleTexture.test.js`.

## Что сейчас в плагине

- `vimp-tanks/src/client/bakers/{explosionTexture,smokeTexture,impactParticleTexture}.js`
  — три отдельных файла, каждый возвращает голую текстуру.
- `vimp-tanks/src/client/bakers/index.js` — восемь ключей, восемь импортов.
- Тестов бейкеров нет вообще.

## Совместимость с движком

Проверено: `vimp/packages/engine/src/client/providers/BakingProvider.js`
(`destroyBaked`) рекурсивно обходит возвращённое значение и вызывает
`destroy(true)` у всего, что умеет; число `contentSize` он пропускает, а
`texture` уничтожает. **Возврат объекта вместо текстуры движок переживает —
правок в `vimp` не требуется.**

## Шаги

1. Скопировать `blurMargin.js` и `blurredCircleTexture.js` в
   `vimp-tanks/src/client/bakers/` (импорты `pixi.js` в плагине те же).
2. Удалить `explosionTexture.js`, `smokeTexture.js`, `impactParticleTexture.js`;
   переписать `bakers/index.js` по образцу tank-battle (три ключа → один бейкер).
3. Перенести параметры бейков в `vimp-tanks/src/config/client.js`
   (`quality`, `radius`, `blur`, `color`) — сверить с текущими значениями плагина,
   расхождения разрешать в пользу `tank-battle`.
4. Обновить потребителей на `{ texture, contentSize }`:
   `SmokeEffect`, `ExplosionEffect`, `ImpactEffect` — см. этап 4, где эта
   правка идёт вместе с масштабированием по радиусу.
5. Перенести оба теста бейкеров в `vimp-tanks/tests/client/bakers/`.

## Тесты

- `blurMargin.test.js` — множитель и округление вверх.
- `blurredCircleTexture.test.js` — размер холста `(radius + margin) * 2`,
  `filter.padding`, `contentSize === radius * 2`.
- Плагин тестирует Pixi через `happy-dom` (`vitest.config.js`) — как в
  `tests/client/parts/Map.test.js`; переносить с той же подменой рендерера.

## Готово когда

- `npm test`, `npx eslint .` зелёные; в `dist/` нет ссылок на удалённые бейкеры.
- `npm run dev` (standalone) — взрыв, дым и осколки видны, без прямоугольных
  краёв у частиц.
- Документация: `vimp-tanks/docs/{en,ru}/extending.md` (раздел про бейкеры) и
  `configuration.md` (параметры `bakers` в `client.js`).

## Риски

Этап меняет **контракт бейкера** для трёх ассетов. Если оставить потребителей
на старом виде (`assets.explosionTexture` как текстура), они получат объект и
Pixi упадёт при создании спрайта. Поэтому этапы 3 и 4 имеет смысл сливать в
одну ветку, даже если разбираются по отдельности.
