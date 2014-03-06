![poster](https://raw.github.com/lgick/VIMP-Tank-Battle/master/public/img/poster2.png)


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
};
```
