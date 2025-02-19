export default class GameView {
  constructor(model, stage) {
    this._stage = new createjs.Stage(stage);
    this._model = model;

    // подписка на события модели
    this._mPublic = this._model.publisher;

    this._mPublic.on('create', 'add', this);
    this._mPublic.on('remove', 'remove', this);
    this._mPublic.on('clear', 'clear', this);
  }

  // создает экземпляр на полотне
  add(instance) {
    this._stage.addChild(instance);

    this._stage.sortChildren((a, b) => {
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
    const width = this._stage.canvas.width;
    const height = this._stage.canvas.height;
    const x = +(width / 2 - coords.x * scale).toFixed();
    const y = +(height / 2 - coords.y * scale).toFixed();

    this._stage.setTransform(x, y, scale, scale);

    this._stage.update();
  }

  // удаляет экземпляр с полотна
  remove(instance) {
    this._stage.removeChild(instance);
  }

  // полностью очищает полотно
  clear() {
    this._stage.removeAllChildren();
  }
}
