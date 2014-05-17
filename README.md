![poster](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/poster2.png)

<!---
# Установка
```
git clone https://github.com/lgick/VIMP-Tank-Battle.git tank && cd tank && npm i && bower i && npm start
```
-->


# Socket switch (message-IDs)

## Client switch

    0: ban data
    1: config data
    2: full server data
    3: auth data
    4: auth errors
    5: map data
    6: shot data
    7: test

## Server switch

    0: config ready
    1: auth response
    2: map ready
    3: keys data
    4: chat data
    5: vote data


# Модуль STAT

Статистика игры.

![stat](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/stat/stat.png)

## Конфиг для модели

``` js
tables: ['team1', 'team2', 'spectators'],
sortList: {
  'team1': [[2, true], [3, false]],
  'team2': [[2, true], [3, false]]
}
```

* ``tables`` - массив с id таблиц
* ``sortList`` - объект с параметрам сортировки

#### Сортировка таблиц

Сортировка осуществляется с учетом объекта ``sortList``. Сортировка происходит при добавлении/изменении строки в таблице.

Свойства ``sortList`` - это id таблиц. Значение свойств - массив с параметрами (например ``[[3, true], [4, false]]``).

Массив состоит из подмассивов (например ``[3, true]``). Каждый подмассив является параметром для сортировки. Если результат сравнения при сортировки с использованием первого подмассива не даст результата (значения будут эквивалентны), то сортировка будет производится по следующему подмассиву и т.д.

Подмассив состоит из двух значений. Первое - это номер ячейки для сортировки (0 - первая ячейка, 1 - вторая и т.д.), второе значение (булево значение): если ``true`` - сортировка по убыванию (чем выше строка, тем значение больше), если ``false`` - сортировка по возрастанию (чем выше строка, тем значение меньше).

## Объект данных с сервера для обновления статистики

``` js
statArray = [
  [
    [6, 0, ['bot 6', '', 5, 1], 0],
    [1, 0, ['bot 1', 'dead', 2, 3], 0],
    [4, 0, ['bot 4', '', 0, 4], 0],
    [3, 1, ['bot 3', 'dead', 2, 0], 0],
    [8, 1, ['bot 8', '', 1, 10], 0],
    [23, 1, ['bot 23', '', 1, 8], 0],
    [12, 1, ['bot 12', 'dead', 1, 7], 0],
    [33, 1, null, 0],
    [17, 2, ['bot 17'], 0],
    [64, 2, ['bot 64'], 0],
    [19, 2, null, 0]
  ],
  [
    [0, [3, '', 20, ''], 0],
    [1, [4, '', 30, ''], 0]
  ]
];
```

### Объект ``statArray``

Является массивом и имеет две вложенности.

##### ``statArray[0]`` - данные для ``<tbody>``.

Эти данные имеют 4 вложенности:

1. id строки
2. порядковый номер для определения id таблицы
3. массив значений для ячеек
4. номер для tBodies (если несколько ``<tbody>``). По умолчанию 0

##### ``statArray[1]`` - данные для ``<thead>``.

Эти данные имеют 3 вложенности:

1. порядковый номер для определения id таблицы
2. массив значений для ячеек
3. номер строки в tHead (если несколько ``<tr>``). По умолчанию 0

#### Типы значений:

##### Объект ``null``

Удаляет строку. Например ``['superman', 1, null]`` удалит строку, которая имеет атрибут ``id='stat_superman'``.

##### Пустая строка

Меняет значение ячейки на пустое. Например ``['don', 1, ['don', '', 1, 8]]`` - вторая ячейка будет иметь пустое значение.

##### Значение не опеределено (``undefined``)

Не изменяет значение в ячейке. Например ``['don', 1, [ , '', , 9]`` - первая и третья ячейки останутся без изменений.


# Модуль VOTE

Позволяет игроку изменять что-то в игре. Например изменить свой статус и перейти в другую команду, или создать голосование для смены карты игры, или предложить забанить игрока, или...

Модуль позволяет общаться пользователям с сервером.

Модуль может вызываться без запроса игрока. Пример: другой пользователь захотел сменить карту и создал голосование. У всех пользователей появилось окошко с выбором поддержать или нет это предложение.

Модуль может отображать как одно голосование, так и несколько, тем самым создавая своеобразное меню:

![vote-menu](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/vote/vote-menu.png)

Голосование может иметь:

* значения подгружаемые с сервера (список текущих пользователей)
* неограниченное количество уровней опроса (кому бан, за что бан, на сколько бан и т.п.) 
* неограниченное количество возможных значений (появляется навигация в виде ``more`` и ``back``)

![vote-ban1](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/vote/vote-ban1.png)

![vote-ban2](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/vote/vote-ban2.png)

![vote-ban3](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/vote/vote-ban3.png)

Модуль имеет время жизни и через некоторое время бездействия пользователя удаляется.

Результатом голосования будет объект, отправленный на сервер.


# Иерархия модулей

Нужно для корректного отображения модулей.

1. informer
2. auth
3. stat
4. vote
5. panel
6. chat
7. radar
8. vimp


# GAME CONFIG

## user

### canvasOptions

Объект данных для масштабирования элемента canvas и кадра игры. Свойства объекта это id элементов canvas. Пример:

``` js
canvasOptions: {
  vimp: {
    aspectRatio: '3:2',
    screenRatio: 1,
    scale: 1,
    defaultSize: 612
  },
  radar: {
    aspectRatio: '1:1',
    screenRatio: 0.15,
    scale: 0.05,
    defaultSize: null
  }
}
```

#### aspectRatio

Соотношение сторон canvas. Первая цифра - ширина, вторая - высота.

Если указать оба значения равные, например ``aspectRatio: '1:1'``, то canvas будет иметь форму квадрата и его высота будет равна ширине.

Если не указывать этот параметр или указать его как ``aspectRatio: null``, то ширина и высота будут иметь максимально возможные значения.

#### screenRatio

Коэффициент размера canvas относительно размера окна. Учитывается при ресайзе и означает какую часть свободной области будет использовать canvas.

Например: ``screenRatio: 0.5`` при ширине свободной области в 1000px образует ширину canvas равной 1000 * 0.5 = 500px.

Если не указывать этот параметр или указать его как ``screenRatio: 1``, размер элемента будет иметь максимально возможные значения.

#### scale

Масштаб изображения на полотне. По умолчанию ``scale: '1:1'``.


# Данные с сервера

## Данные с сервера для создания кадра игры

Объект данных с сервера для создания кадра игры состоит из 3-х параметров:

* **constructors** - массив, содержащий имена конструкторов, для которых предназначены данные:

```
['Tank', 'Radar']
```

* **instances** - объект, состоящий из имен экземпляров.
Значение свойств объекта **instances** поступает в конструкторы из **constructors**

```
{bob: {...}, jek: {...}}
```

* **cache** - булево значение, означающее как нужно создавать новые экземпляры.

#### Кэшируемые данные (`cache === true`)

Экземпляры будут создаваться лишь один раз, а потом только изменяться.

Если экземпляр уже создан, данные будут переданы методу **update()** конструктора, и экземпляр просто обновит свои данные.Это удобно использовать для долгоживущих, уникальных предметов игры. Например: отображение игрока. Игрок уникален (имеет один набор данных для создания) и постоянно отображается в игре. Тоже самое игрок на радаре.

#### Некэшируемые данные (`cache === false`)

Экземпляры будут создаваться каждый раз заново.

Это удобно использовать для маложивущих количественных предметов. Например: пули игрока отображаются в большом количестве на кадре игры. Все пули игрока можно поместить в один экземпляр, который создавать заново каждый раз.

### Пример данных для создания кадра игры:

``` js
[
  [
    [1, 2],
    {
      '1': [64, 320, 0, 0, 1, 'bob'],
      '3': [736, 320, 180, 0, 2, 'jek'],
      '5': null
    },
    true
  ],
  [
    [3],
    {
      '1': [
        [190, 72],
        [10, 4],
        [100, 24]
        [332, 94],
        [390, 72],
        [159, 334]
      ],
      '3': [
        [100, 320],
        [120, 320],
        [130, 320],
        [140, 320],
        [339, 44],
        [300, 994]
      ]
    },
    false
  ]
]
```

## Данные с сервера полностью (пример):

``` js
[
  // game
  [
    [
      [1, 2],
      {
        '1': [64, 320, 0, 0, 1, 'bob'],
        '3': [736, 320, 180, 0, 2, 'jek'],
        '5': null
      },
      true
    ],
    [
      [3],
      {
        '1': [
          [190, 72],
          [10, 4],
          [100, 24]
          [332, 94],
          [390, 72],
          [159, 334]
        ],
        '3': [
          [100, 320],
          [120, 320],
          [130, 320],
          [140, 320],
          [339, 44],
          [300, 994]
        ]
      },
      false
    ]
  ],

  // coords (x, y)
  [400, 320],

  // panel
  [97, 777, 3],

  // stat
  [
    [
      [6, 0, ['bot 6', '', 5, 1], 0],
      [1, 0, ['bot 1', 'dead', 2, 3], 0],
      [4, 0, ['bot 4', '', 0, 4], 0],
      [3, 1, ['bot 3', 'dead', 2, 0], 0],
      [8, 1, ['bot 8', '', 1, 10], 0],
      [23, 1, ['bot 23', '', 1, 8], 0],
      [12, 1, ['bot 12', 'dead', 1, 7], 0],
      [33, 1, null, 0],
      [17, 2, ['bot 17'], 0],
      [64, 2, ['bot 64'], 0],
      [19, 2, null, 0]
    ],
    [
      [0, [3, '', 20, '']],
      [1, [4, '', 30, '']]
    ]
  ],

  // chat (name, text)
  ['User', 'Hello World!'],

  // vote
  {
    vote: 'ban',
    title: 'Забанить пользователя User?',
    key: 'ban',
    value: ['Да', 'Нет'],
    next: null
  }
]
```
