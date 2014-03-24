![poster](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/poster2.png)

# Статистика

Обновляется из данных приходящих с сервера.

## Объект статистики

``` js
{
  groups: {
    team1: {
      score: 5,
      players: 3
    },
    team2: {
      score: 3,
      players: 2
    },
    spectators: {
      score: null,
      players: 1
    }
  },
  players: {
    bot1: {
      group: 'team1',
      status: 1,
      score: 3,
      deaths:5
    },
    bot2: {
      group: 'team2',
      status: 0,
      score: 1,
      deaths:2
    },
    bot3: {
      group: 'team2',
      status: 1,
      score: 3,
      deaths:0
    },
    bot4: {
      group: 'team1',
      status: 0,
      score: 1,
      deaths:3
    },
    bot5: {
      group: 'spectators',
      status: 0,
      score: 3,
      deaths:7
    },
    bot6: {
      group: 'team1',
      status: 1,
      score: 3,
      deaths:5
    }
  }
}
```


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
  {
    constructors: ['Tank', 'Radar'],
    instances: {
      bob: {
        layer: 1,
        team: 'team1',
        x: 200,
        y: 499,
        rotation: 180,
        gunRotation: 40
      },
      jek: {
        layer: 1,
        team: 'team1',
        x: 200,
        y: 499,
        rotation: 180,
        gunRotation: 40
      }
    },
    cache: true
  },
  {
    constructors: ['Bullets'],
    instances: {
      bob: [
        {
          x: 200,
          y: 499
        },
        {
          x: 20,
          y: 99
        },
        {
          x: 240,
          y: 9
        },
        {
          x: 600,
          y: 899
        }
      ],
      jek: [
        {
          x: 400,
          y: 499
        },
        {
          x: 220,
          y: 199
        }
      ]
    },
    cache: false
  }
]
```

## Данные с сервера полностью (пример):

``` js
{
  user: {
    scale: 1,
    x: 399,
    y: 34
  },
  data: [
    {
      constructors: ['Tank', 'Radar'],
      instances: {
        bob: {
          layer: 1,
          team: 'team1',
          x: 200,
          y: 499,
          rotation: 180,
          gunRotation: 40
        },
        jek: {
          layer: 1,
          team: 'team1',
          x: 200,
          y: 499,
          rotation: 180,
          gunRotation: 40
        }
      },
      cache: true
    },
    {
      constructors: ['Bullets'],
      instances: {
        bob: [
          [100, 320],
          [120, 320],
          [130, 320],
          [140, 320],
          [339, 44],
          [300, 994],
          [3, 34],
          [339, 44],
          [339, 44],
          [332, 94],
          [390, 72],
          [159, 334]
        ],
        jek: [
          [683, 34],
          [230, 44],
          [100, 134],
          [8, 34],
          [360, 74],
          [50, 34],
          [190, 72],
          [10, 4],
          [100, 24]
        ]
      },
      cache: false
    }
  ]
};
```
