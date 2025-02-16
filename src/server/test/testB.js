function getInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

exports.gameA = function () {
  var x = 0;
  var f = true;

  return function () {

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
            bob: [64, 320, 0, 0, 'team1'],
            jek: [736, 320, 180, 0, 'team2']
          },
          cache: true
        },
        {
          constructors: ['Bullet'],
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

    return data;
  };
};

// number: количество ботов
// coords: массив коорданат [xMin, xMax, yMin, yMax, rMin, rMax, gMin, gMax]
// type: массив типов
exports.gameB = function (number, coords, type) {
  number = number || 10;
  coords = coords || [0, 800, 0, 600, 0, 360, -90, 90];
  type = type || ['team1', 'team2', null];

  var bots = {}
    , xMin = coords[0]
    , xMax = coords[1]
    , yMin = coords[2]
    , yMax = coords[3]
    , rMin = coords[4]
    , rMax = coords[5]
    , gMin = coords[6]
    , gMax = coords[7]
    , count = 0
    , crds = [xMax / 2, yMax / 2];

  while (count < number) {
    bots['bot#' + count] = [
      getInt(xMin, xMax),
      getInt(yMin, yMax),
      getInt(rMin, rMax),
      0,
      type[getInt(0, type.length - 2)]
    ];

    count += 1;
  }

  return function () {
    var rad, cX, cY, cR, vX, vY, nX, nY, p, rStatus, rValue;

    // проверяет число в заданном диапазоне
    // Если repeat === true, то диапазон зациклен
    // Если repeat === false, то диапазон ограничен значениями
    // Возвращает значение
    function rangeNumber(value, repeat, max, min) {
      repeat = repeat || false;
      max = max || 360;
      min = min || 0;

      // зациклить
      if (repeat === true) {
        if (value <= min) {
          value = max + value;
        }
        if (value >= max) {
          value = value - max;
        }
      // не зацикливать
      } else {
        if (value <= min) {
          value = min;
        }
        if (value >= max) {
          value = max;
        }
      }

      return value;
    }

    for (p in bots) {
      if (bots.hasOwnProperty(p)) {
        // изменение поворота
        rStatus = getInt(0, 2);

        if (rStatus) {
          // left
          if (rStatus === 1) {
            rValue = -5;
          // right
          } else if (rStatus === 2) {
            rValue = 5;
          }

          bots[p][2] = rangeNumber(bots[p][2] + rValue, false, gMax, gMin);
        }

        cX = bots[p][0];
        cY = bots[p][1];
        cR = bots[p][2];

        rad = +(cR * (Math.PI / 180)).toFixed(10);

        vX = Math.cos(rad) * 4;
        vY = Math.sin(rad) * 4;

        nX = Math.round(vX) + cX;
        nY = Math.round(vY) + cY;

        bots[p][0] = rangeNumber(nX, true, xMax, 0);
        bots[p][1] = rangeNumber(nY, true, yMax, 0);
        //bots[p][4] = type[getInt(0, type.length - 1)];
      }
    }

    var data = [
      [
        {
          constructors: ['Tank', 'Radar'],
          instances: bots,
          cache: true
        }
      ],
      [bots['bot#0'][0], bots['bot#0'][1]]
    ];

    return data;
  };
};

// coords: массив коорданат [xMin, xMax, yMin, yMax, rMin, rMax, gMin, gMax]
// type: массив с номером типа модели (от и до)
// gameC - возвращает только координаты одного юзера, а не готовый массив
exports.gameC = function (coords, type) {
  coords = coords || [0, 800, 0, 600, 0, 360, -90, 90];
  type = type || [1, 3];

  var bot
    , xMin = coords[0]
    , xMax = coords[1]
    , yMin = coords[2]
    , yMax = coords[3]
    , rMin = coords[4]
    , rMax = coords[5]
    , gMin = coords[6]
    , gMax = coords[7]
    , crds = [xMax / 2, yMax / 2];

  bot = [
    getInt(xMin, xMax),
    getInt(yMin, yMax),
    getInt(rMin, rMax),
    0,
    getInt(type[0], type[1])
  ];

  return function () {
    var rad, cX, cY, cR, vX, vY, nX, nY, p, rStatus, rValue;

    // проверяет число в заданном диапазоне
    // Если repeat === true, то диапазон зациклен
    // Если repeat === false, то диапазон ограничен значениями
    // Возвращает значение
    function rangeNumber(value, repeat, max, min) {
      repeat = repeat || false;
      max = max || 360;
      min = min || 0;

      // зациклить
      if (repeat === true) {
        if (value <= min) {
          value = max + value;
        }
        if (value >= max) {
          value = value - max;
        }
      // не зацикливать
      } else {
        if (value <= min) {
          value = min;
        }
        if (value >= max) {
          value = max;
        }
      }

      return value;
    }

    // изменение поворота
    rStatus = getInt(0, 2);

    if (rStatus) {
      // left
      if (rStatus === 1) {
        rValue = -5;
      // right
      } else if (rStatus === 2) {
        rValue = 5;
      }

      bot[2] = rangeNumber(bot[2] + rValue, false, gMax, gMin);
    }

    cX = bot[0];
    cY = bot[1];
    cR = bot[2];

    rad = +(cR * (Math.PI / 180)).toFixed(10);

    vX = Math.cos(rad) * 4;
    vY = Math.sin(rad) * 4;

    nX = Math.round(vX) + cX;
    nY = Math.round(vY) + cY;

    bot[0] = rangeNumber(nX, true, xMax, 0);
    bot[1] = rangeNumber(nY, true, yMax, 0);

    var data = [
      bot,
      [bot[0], bot[1]]
    ];

    return data;
  };
};

// maxValue: максимальное значение
exports.panel = function (maxValue) {
  maxValue = maxValue || 1000;

  return function () {
    var data = [getInt(1, maxValue), getInt(1, maxValue), getInt(1, maxValue)];

    return data;
  };
};

// tables - количество таблиц
// users - количество пользователей
// maxValue - максимально допустимое значение
exports.stat = function (tables, users, maxValue) {
  tables = tables || 2;
  users = users || 10;
  maxValue = maxValue || 30;

  return function () {
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

        // отправляет данные или null
        //cellsData = getInt(0, 1) ? ['bot_' + i2, dead, getInt(0, maxValue), getInt(0, maxValue)] : null;

        // отправляет только данные
        cellsData = ['bot_' + i2, dead, getInt(0, maxValue), getInt(0, maxValue)];

        data[0].push([i2, i, cellsData]);
      }
    }

    return data;
  };
};

// maxValue - количество символов
exports.chat = function (max) {
  max = max || 1000;

  return function () {
    var data = ['User', 'test_' + getInt(0, max)];

    return data;
  };
};

exports.vote = function () {
  return function () {
    var data = {
      vote: 'ban',
      title: 'Забанить пользователя User?',
      key: 'ban',
      value: ['Да', 'Нет'],
      next: null
    };

    return data;
  };
};
