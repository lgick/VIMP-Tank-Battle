define(['createjs'], function (createjs) {
  var Shape = createjs.Shape;

  function Bullet(params) {
    var data = params.data
      , publisher = params.publisher
      , shape = new Shape()
      , vX = Math.round(Math.cos(data[2]) * 20) + data[4]
      , vY = Math.round(Math.sin(data[2]) * 20) + data[5]
      , times = 50
      , g;

    shape.x = data[0];
    shape.y = data[1];
    shape.layer = data[3];

    shape.addEventListener('tick', function () {
      if (times) {
        shape.x += vX;
        shape.y += vY;
        times -= 1;
      } else {
        shape.removeEventListener('tick');
        publisher.emit('remove', shape);
      }
    });

    g = shape.graphics;

    switch (data[6]) {
      case 1:
        g.setStrokeStyle(1);
        g.beginStroke('#333');
        g.beginFill('#fff');
        g.drawCircle(0, 0, 2);
        break;
      case 2:
        g.setStrokeStyle(1);
        g.beginStroke('#fff');
        g.beginFill('#500');
        g.drawCircle(0, 0, 5);
        break;
    }

    publisher.emit('create', shape);
  }

  return Bullet;
});
