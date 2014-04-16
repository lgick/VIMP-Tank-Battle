function getInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// time - временной промежуток
// tables - количество таблиц
// users - количество пользователей
// maxValue - максимально допустимое значение
exports.stat = function (socket, time, tables, users, maxValue) {
  time = time || 100;
  tables = tables || 2
  users = users || 10;
  maxValue = maxValue || 500;

  setInterval(function () {
    var data = []
      , i
      , i2
      , dead
      , cellsData;

    // tbody
    data[0] = [];

    // thead
    data[1] = [[getInt(0, 1), [getInt(0, maxValue), '', getInt(0, maxValue), '']]];

    for (i = 0; i < tables; i += 1) {
      for (i2 = 0; i2 < users; i2 += 1) {
        dead = getInt(0, 1) ? 'dead' : '';

        cellsData = getInt(0, 1) ? ['bot_' + i2, dead, getInt(0, maxValue), getInt(0, maxValue)] : null;
        //cellsData = ['bot_' + i2, dead, getInt(0, maxValue), getInt(0, maxValue)];

        data[0].push([i2, i, cellsData]);
      }
    }

    socket.emit('test', {module: 'stat', data: data});
  }, time);
};

// time - временной промежуток
// max - количество символов
exports.chat = function (socket, time, max) {
  time = time || 100;
  max = max || 1000;

  setInterval(function () {
    socket.emit('test', {
      module: 'chat',
      data: 'test_' + getInt(0, max)
    });
  }, time);
};

// time - временной промежуток
exports.game = function (socket, time) {
  var x = 0;
  var f = true;
  time = time || 50;

  setInterval(function () {

   if (f) {
     x += 5;
   } else {
     x -= 5;
   }

   if (x === 1000) {
     f = false;
   }

   if (x === 0) {
     f = true;
   }

    var data = [
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

      [x, x]
    ];

    socket.emit('test', {
      module: 'game',
      data: data
    });
  }, time);
};

exports.panel = function (socket, time, maxValue) {
  time = time || 50;
  maxValue = maxValue || 1000;

  setInterval(function () {
    var data = [getInt(1, maxValue), getInt(1, maxValue), getInt(1, maxValue)];

    socket.emit('test', {
      module: 'panel',
      data: data
    });
  }, time);
};

exports.vote = function (socket, time) {
  time = time || 50;

  setInterval(function () {
    var data = {
      vote: 'ban',
      title: 'Забанить пользователя User?',
      key: 'ban',
      value: ['Да', 'Нет'],
      next: null
    }

    socket.emit('test', {
      module: 'vote',
      data: data
    });
  }, time);
};
