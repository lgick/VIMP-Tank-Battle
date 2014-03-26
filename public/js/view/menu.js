define(['Publisher'], function (Publisher) {
  // Singleton MenuView
  var menuView;

  function MenuView(model, data) {
    if (menuView) {
      return menuView;
    }

    menuView = this;

    this.publisher = new Publisher();

    this._mPublic = model.publisher;
  }

  return MenuView;
});
