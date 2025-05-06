export default class GameView {
  constructor(model, app) {
    this._app = app;

    this._model = model;

    // подписка на события модели
    this._mPublic = this._model.publisher;

    this._mPublic.on('create', 'add', this);
    this._mPublic.on('remove', 'remove', this);
  }

  // создает экземпляр на полотне
  add(instance) {
    this._app.stage.addChild(instance);

    this._app.stage.sortChildren((a, b) => {
      if (a.layer < b.layer) {
        return -1;
      }

      if (a.layer > b.layer) {
        return 1;
      }

      return 0;
    });
  }

  // вычисляет координаты для отображения
  // пользователя по центру игры и обновляет полотно
  update(coords, scale) {
    const width = this._app.canvas.width;
    const height = this._app.canvas.height;
    const x = +(width / 2 - coords.x * scale).toFixed();
    const y = +(height / 2 - coords.y * scale).toFixed();

    this._app.stage.updateTransform({ x, y, scaleX: scale, scaleY: scale });
    this._app.render();
  }

  // удаляет экземпляр с полотна
  remove(instance) {
    instance.destroy();
  }
}
