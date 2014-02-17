var utils = {
  // возвращает случайное целое число в заданном диапазоне
  getRandom: function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // возвращает объект с игроками ботами
  // TODO: еще может поменятся!
  getBot: function (params) {
    var bots = {}
      , sum = params.sum || 20
      , xMin = params.xMin || 0
      , xMax = params.xMax || 800
      , yMin = params.yMin || 0
      , yMax = params.yMax || 600
      , rMin = params.rMin || 0
      , rMax = params.rMax || 360
      , count = 0
      , botName, colorA, colorB, x, y, rotation, model;

    while (count < sum) {
      botName = 'bot# ' + count;
      colorA = 'rgb(' +
        this.getRandom(0, 255) + ', ' +
        this.getRandom(0, 255) + ', ' +
        this.getRandom(0, 255) + ')';
      colorB = 'rgb(' +
        this.getRandom(0, 255) + ', ' +
        this.getRandom(0, 255) + ', ' +
        this.getRandom(0, 255) + ')';
      x = this.getRandom(xMin, xMax);
      y = this.getRandom(yMin, yMax);
      rotation = this.getRandom(rMin, rMax);
      model = this.getRandom(0, 1);

      bots[botName] = {
        vimp: {
          player: {
            constructor: model ? 'Halk' : 'Flat',
            colorA: colorA,
            colorB: colorB,
            scale: 1,
            x: x,
            y: y,
            rotation: rotation,
            flameStatus: true
          }
        },
        radar: {
          constructor: 'Radar',
          colorA: colorA,
          colorB: colorB,
          scale: 1,
          x: x,
          y: y,
          rotation: rotation
        }
      };

      count += 1;
    }

    return bots;
  },

  // передвигает ботов
  goBot: function (bots, mapWidth, mapHeight) {
    var rad, cX, cY, cR, vX, vY, nX, nY, i;

    for (i in bots) {
      if (bots.hasOwnProperty(i)) {
        cX = bots[i]['vimp']['player']['x'];
        cY = bots[i]['vimp']['player']['y'];
        cR = bots[i]['vimp']['player']['rotation'];

        rad = +(cR * (Math.PI / 180)).toFixed(10)

        vX = Math.cos(rad) * 32
        vY = Math.sin(rad) * 32

        nX = Math.round(vX) + cX;
        nY = Math.round(vY) + cY;

        bots[i]['vimp']['player']['x'] = bots[i]['radar']['x'] =
          this.rangeNumber(nX, true, mapWidth, 0);

        bots[i]['vimp']['player']['y'] = bots[i]['radar']['y'] =
          this.rangeNumber(nY, true, mapHeight, 0);
      }
    }

    return bots;
  },

  // проверяет число в заданном диапазоне
  // Если repeat === true, то диапазон зациклен
  // Если repeat === false, то диапазон ограничен значениями
  // Возвращает значение
  rangeNumber: function (value, repeat, max, min) {
    var repeat = repeat || false
      , max = max || 360
      , min = min || 0;

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
};

module.exports = utils;
