module.exports = [
  // game
  [
    {
      constructors: ['Tank', 'Radar'],
      instances: {
        bob: {
          layer: 1,
          team: 'team1',
          x: 64,
          y: 320,
          rotation: 0,
          gunRotation: 0
        },
        jek: {
          layer: 1,
          team: 'team2',
          x: 736,
          y: 320,
          rotation: 180,
          gunRotation: 0
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
  ],

  // coords (x, y)
  [400, 320],

  // panel
  [97, 777, 3],

  // stat
  [
    [
      [6, 0, ['bot 1', '', 5, 1], 0],
      [1, 0, ['bob 2', 'dead', 2, 3], 0],
      [4, 0, ['lol32', '', 0, 4], 0],
      [3, 1, ['coco', 'dead', 2, 0], 0],
      [8, 1, ['george', '', 1, 10], 0],
      [23, 1, ['don', '', 1, 8], 0],
      [12, 1, ['din', 'dead', 1, 7], 0],
      [33, 1, null, 0],
      [17, 2, ['kaka'], 0],
      [64, 2, ['x-man'], 0],
      [19, 2, null, 0]
    ],
    [
      [0, [3, '', 20, '']],
      [1, [4, '', 35, ''], 0]
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
];
