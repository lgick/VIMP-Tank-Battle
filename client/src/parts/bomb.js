define(['createjs'], function (createjs) {
  var Container = createjs.Container
    , Shape = createjs.Shape
    , Text = createjs.Text
    , Bomb
    , p;

  Bomb = function (params) {
    this.initialize(params);
  };

  p = Bomb.prototype = createjs.extend(Bomb, Container);
  Bomb = createjs.promote(Bomb, 'Container');

  // инициализация
  p.initialize = function (params) {
    this.Container_constructor();

    this.layer = 2;

    this.body = new Shape();
    this.text = new Text();
    this.text.color = '#ff3300';
    this.text.font = '10px Arial';
    this.text.x = -12;
    this.text.y = -5;

    this.addChild(this.body);
    this.addChild(this.text);

    this.x = params[0];
    this.y = params[1];
    this.text.text = this.time = params[2];
    this.rotation = 0;

    this.addEventListener('tick', (function () {
      this.updateTime();
    }).bind(this));

    this.create();
  };

  // обновляет время динамита
  p.updateTime = function () {
    var hours
      , minutes
      , seconds;

    if (this.time > 0) {
      this.time -= 1;

      hours = Math.floor(this.time / 3600);
      minutes = Math.floor((this.time - (hours * 3600)) / 60);
      seconds = this.time - (hours * 3600) - (minutes * 60);

      if (hours < 10) {
        hours = '0' + hours;
      }

      if (minutes < 10) {
        minutes = '0' + minutes;
      }

      if (seconds < 10) {
        seconds = '0' + seconds;
      }

      this.text.text = minutes + ':' + seconds;
    }
  };

  // создает экземпляр
  p.create = function () {
    var g = this.body.graphics;

    g.setStrokeStyle(1);
    g.beginStroke('#333');
    g.beginFill('#275C2D');
    g.drawRect(-15, -15, 30, 30, 3);
  };

  // обновляет экземпляр
  p.update = function () {
  };

  return Bomb;
});
