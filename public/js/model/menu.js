define(['Publisher'], function (Publisher) {
  // Singleton MenuModel
  var menuModel;

  function MenuModel(data) {
    if (menuModel) {
      return menuModel;
    }

    menuModel = this;

    this.publisher = new Publisher();
  }

  return MenuModel;
});
