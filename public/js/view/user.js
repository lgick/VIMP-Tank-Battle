define(['Publisher'], function (Publisher) {
  // Singleton UserView
  var userView;

  function UserView(model, data) {
    if (userView) {
      return userView;
    }

    userView = this;

    this._window = data.window;
    this._document = this._window.document;

    this._displayID = data.displayID;

    this.publisher = new Publisher();

    this._window.onkeydown = function (event) {
      userView.publisher.emit('keyDown', event);
    };

    this._window.onkeyup = function (event) {
      userView.publisher.emit('keyUp', event);
    };

    this._window.onresize = function () {
      userView.publisher.emit('resize', {
        width: userView._window.innerWidth,
        height: userView._window.innerHeight
      });
    };

    this._mPublic = model.publisher;

    this._mPublic.on('init', 'init', this);
    this._mPublic.on('resize', 'resize', this);
  }

  // инициализация
  UserView.prototype.init = function () {
    var i = 0
      , len = this._displayID.length
      , elem;

    for (; i < len; i += 1) {
      elem = this._document.getElementById(this._displayID[i]);
      elem.style.display = 'block';
    }
  };

  // изменение размеров
  UserView.prototype.resize = function (sizes) {
    var id
      , elem;

    for (id in sizes) {
      if (sizes.hasOwnProperty(id)) {
        elem = this._document.getElementById(id);

        if (elem) {
          elem.style.width = sizes[id].width + 'px';
          elem.style.height = sizes[id].height + 'px';
        }
      }
    }

    this.publisher.emit('redraw', sizes);
  };

  return UserView;
});
