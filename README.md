``` js

// данные с сервера
var data = {
  constructor: ['Tank', 'Radar'],
  data: {
    bob: [
      {
        layer: 1,
        team: 'team1',
        x: 200,
        y: 499,
        rotation: 180,
        gunRotation: 40
      }
    ],
    jek: [
      {
        layer: 1,
        team: 'team1',
        x: 200,
        y: 499,
        rotation: 180,
        gunRotation: 40
      }
    ]
  }
};

// игроки
parse(['Tank', 'Radar'], {
  bob: [
    {
      layer: 1,
      team: 'team1',
      x: 200,
      y: 499,
      rotation: 180,
      gunRotation: 40
    }
  ],
  jek: [
    {
      layer: 1,
      team: 'team1',
      x: 200,
      y: 499,
      rotation: 180,
      gunRotation: 40
    }
  ]
});


// пули
parse(['Bullets'], {
  bob: [
    {
      x: 300,
      y: 499,
    },
    {
      x: 700,
      y: 499,
    },
    {
      x: 200,
      y: 499,
    }
  ],
  jek: [
    {
      x: 300,
      y: 499,
    },
    {
      x: 700,
      y: 499,
    },
    {
      x: 200,
      y: 499,
    }
  ]
});

```
