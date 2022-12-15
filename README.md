![poster](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/poster2.png?raw=true)

# VIMP Tank Battle (в работе)

Многопользовательская 2D онлайн реалтайм игра.

# Установка

```
git clone git@github.com:lgick/VIMP-Tank-Battle.git tank && cd tank && npm i && bower i && node server.js
```

# Параметры при запуске сервера

* ``domain`` - домен (по умолчанию ``localhost``)
* ``port`` - порт (по умолчанию ``3000``)
* ``map`` - карта при запуске (по умолчанию ``arena``)
* ``players`` - лимит игроков на сервере (по умолчанию ``10``)
* ``rtime`` - время раунда (по умолчанию ``60000``)
* ``mtime`` - время карты (по умолчанию ``180000``)

Пример запуска:

``node server.js --players=20 --domain=192.33.44.55 --port=3000 --map=mini --rtime=50000 --mtime=150000``


# WebSocket ports (message-IDs)

## Client ports

    0: config data
    1: auth data
    2: auth errors
    3: map data
    4: shot data
    5: inform data
    6: clear
    7: console

## Server ports

    0: config ready
    1: auth response
    2: map ready
    3: keys data
    4: chat data
    5: vote data


# Модуль PANEL

Данные игры.

Массив с данными ``[<время игры>, <данные>, <данные>, <данные>]``.

Первый элемент массива - время игры. Если значение данных ``null`` - данные игнорируются!

## Конфиг для сервера

``` js
panel: {
  health: {
    key: 0,
    method: '-',
    value: 100,
    minValue: 0
  },
  bullets: {
    key: 1,
    method: '-',
    value: 1000,
    minValue: 0
  }
}
```

* ``key``       - порядковый номер в массиве
* ``method``    - метод обновления (``=`` - замена, ``-`` - вычитание)
* ``value``     - значение по умолчанию (обновляется каждый раунд)
* ``minValue``  - минимально допустимое значение

## Конфиг для клиента

```js
panel: {
  elems: {
    time: 'panel-time',
    health: 'panel-health',
    bullets: 'panel-bullets'
  },
  panels: ['time', 'health', 'bullets']
}
```

* ``elems``   - id элементов
* ``panels``  - список названий элементов


# Модуль STAT

Статистика игры.

![stat](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/stat/stat.png?raw=true)

## Конфиг для модели (сервер)

``` js
name: {
  key: 0,
  bodyMethod: '=',
  headSync: true,
  headMethod: '#'
},
status: {
  key: 1,
  bodyMethod: '=',
  bodyValue: 'dead',
  headValue: ''
},
score: {
  key: 2,
  bodyMethod: '+',
  bodyValue: 0,
  headMethod: '+',
  headValue: 0
},
deaths: {
  key: 3,
  bodyMethod: '+',
  bodyValue: 0,
  headMethod: '+',
  headValue: 0
}
```

* ``key``         - порядковый номер в массиве
* ``bodyMethod``  - метод обновления в body (``=`` - замена, ``+`` - добавление)
* ``bodyValue``   - значение по умолчанию в body
* ``headSync``    - синхронизация body с head (``true`` или ``false``)
* ``headMethod``  - метод обновления в head (``#`` - количество значений, ``=`` - замена, ``+`` - добавление)
* ``headValue``   - значение по умолчанию в head

## Конфиг для модели (клиент)

``` js
tables: ['team1', 'team2', 'spectators'],
sortList: {
  'team1': [[2, true], [3, false]],
  'team2': [[2, true], [3, false]]
}
```

* ``tables``    - массив с id таблиц
* ``sortList``  - объект с параметрам сортировки

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


# Модуль CHAT

Позволяет игрокам обмениваться текстовыми собщениями и получать системные.

Системные сообщения формируются из шаблонных данных из объекта ``messages``

Данные для сообщения могут быть двух видов:

* в виде строки (системное сообщение): ``'<группа шаблонов>:<номер шаблона>:<параметры (через запятую)>'``
* в виде массива (сообщение пользователя): ``[<текст сообщения>, <имя автора>, <тип для класса>]``


# Модуль VOTE

Позволяет игроку изменять что-то в игре. Например изменить свой статус и перейти в другую команду, или создать голосование для смены карты игры, или предложить забанить игрока, или...

Модуль позволяет общаться пользователям с сервером.

Модуль может вызываться без запроса игрока. Пример: другой пользователь захотел сменить карту и создал голосование. У всех пользователей появилось окошко с выбором поддержать или нет это предложение.

### Меню

По умолчанию при вызове модуля отображается меню.

![vote-menu](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/vote/vote-menu.png?raw=true)

```
menu = [
  [
    'team',                              // vote name
    [
      'Сменить команду, статус',         // 0: title
      ['team1', 'team2', 'spectator'],   // 1: value
      null                               // 2: next
    ]
  ],
  [
    'remap',
    [
      'Предложить новую карту',
      ['arena', 'arena_2.0', 'berlin'],
      null
    ]
  ],
  [
    'ban',
    [
      'Предложить забанить игрока',
      'users',
      [
        'Причина бана',
        ['ЧИТЕР', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'HIPSTER'],
        [
          'Время бана (в минутах)',
          ['одна минута', 'пара минут:2', '4:4', '38 - 30'],
          null
        ]
      ]
    ]
  ]
]
```

Голосование может иметь:

* значения подгружаемые с сервера (например список текущих пользователей)
* неограниченное количество уровней опроса (кому бан, за что бан, на сколько бан и т.п.) 
* неограниченное количество возможных значений (появляется навигация в виде ``more`` и ``back``)

![vote-ban1](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/vote/vote-ban1.png?raw=true)

![vote-ban2](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/vote/vote-ban2.png?raw=true)

![vote-ban3](https://github.com/lgick/VIMP-Tank-Battle/blob/master/public/img/vote/vote-ban3.png?raw=true)


### Данные поступающие с сервера могут быть двух видов

* Данные для создания голосования:

```
[
  'ban',  // vote name
  [
    'Забанить пользователя User?',  // 0: title
    ['Да', 'Нет'],                  // 1: values
    null                            // 2: next
  ]
]
```

* Массив значений на запрос от клиента:

```
[
  null,
  ['bob', 'jek', 'vasya', 'petya', 'vovka']
]
```

---

Значения в голосовании ``values`` могут иметь вид:

* ``<value>`` - value выводится на экран и записывается в data
* ``<key>:<value>`` - key выводится на экран, value записывается в data

Модуль имеет время жизни и через некоторое время бездействия пользователя удаляется.

Результатом голосования будет массив вида ``[name, data]``. 
``name`` - название голосования. ``data`` - массив значений.

```
['ban', ['bob', 'ЧИТЕР', '2048']]
```


# Модуль GAME

### Слои отображения игры на полотне (default layer)

|           Type          | Value |
|:-----------------------:|:-----:|
| map static data (under) |   1   |
|     map dynamic data    |   2   |
|        game model       |   2   |
|       bullet model      |   2   |
|  map static data (over) |   3   |


# Иерархия элементов (z-index)

|  Элемент | z-index |
|:--------:|:-------:|
|   vimp   |    1    |
|   radar  |    2    |
|   chat   |    3    |
|   panel  |    4    |
|   vote   |    5    |
|   stat   |    6    |
|   auth   |    7    |
| informer |    8    |


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

### keys

Данные о клавишах игры. Пример:

``` js
keys: {
  keySetList: [
    // spectator keyset
    {
      // next player (n)
      78: {
        key: 1 << 0,
        type: 1
      },
      // prev player (p)
      80: {
        key: 1 << 1,
        type: 2
      }
    },
    // game keyset
    {
      // forward (w)
      87: {
        key: 1 << 0
      },
      // back (s)
      83: {
        key: 1 << 1
      },
      // left (a)
      65: {
        key: 1 << 2
      },
      // right (d)
      68: {
        key: 1 << 3
      },
      // gCenter (u)
      85: {
        key: 1 << 4
      },
      // gLeft (k)
      75: {
        key: 1 << 5
      },
      // gRight (l)
      76: {
        key: 1 << 6
      },
      // fire (j)
      74: {
        key: 1 << 7,
        type: 1
      }
    }
  ],
  modes: {
    67: 'chat',      // чат (c)
    77: 'vote',      // опрос (m)
    9: 'stat'        // статистика (tab)
  },
  cmds: {
    27: 'escape',    // отмена (escape)
    13: 'enter'      // ввод (enter)
  }
}
```

#### keySetList

Клавиши игры. Массив из 2-х наборов (наблюдатель и играющий).
Клавиша - это объект, где помимо самой клавиши ``key``, есть еще параметр ``type``, который отвечает за тип обработки клавиши при нажатии.

``type`` может иметь значение:

* 0 (по умолчанию): многократное нажатие (начинается на keyDown, завершается на keyUp)
* 1 : выполняется один раз на keyDown
* 2 : выполняется один раз на keyUp

#### modes

Включают различные режимы (чат, опрос, голосование).

#### cmds

Базовые клавиши. Имеют наибольший приоритет и применяются в управлении режимами (чат, голосование и т.д.).


# Данные с сервера

## Данные с сервера для создания кадра игры

Если экземпляр уже создан, данные будут переданы методу **update()** конструктора, и экземпляр просто обновит свои данные.

Если передать ``null`` - экземпляр будет удален.

### Пример данных для создания кадра игры:

``` js
[
  {
    'm1': {
      '1': [64, 320, 0, 0, 1, 'bob'],
      '3': [736, 320, 180, 0, 2, 'jek'],
      '5': null
    },
    'm2': {
      '2': [736, 320, 180, 0],
    },
    'b1': {
      'e3a': [680, 128, -20, 0, 2, 2],
      'fsa': [284, 308, 11, 17, 2, 2],
      '4e9': null
    }
  }
]
```

## Данные с сервера полностью (пример):

``` js
[
  // game
  {
    'm1': {
      '1': [64, 320, 0, 0, 1, 'bob'],
      '3': [736, 320, 180, 0, 2, 'jek'],
      '5': null
    },
    'm2': {
      '2': [736, 320, 180, 0],
    },
    'b1': {
      'e3a': [680, 128, -20, 0, 2, 2],
      'fsa': [284, 308, 11, 17, 2, 2],
      '4e9': null
    }
  },

  // coords [x, y]
  [400, 320],

  // panel
  [97, null, '', 100],

  // stat [tBodies, tHead]
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

  // chat [text, name, type]
  ['Hello World!', 'User', 1],

  // vote [vote, data]
  [
    'ban',
    [
      'Забанить пользователя User?',  // 0: title
      ['Да', 'Нет'],                  // 1: values
      null                            // 2: next
    ]
  ],

  // keyset (0 - spectator keyset, 1 - game keyset)
  1
]
```
