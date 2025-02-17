// Контроллер игры
export default class GameCtrl {
  constructor(model, view) {
    this._model = model;
    this._view = view;
  }

  // обрабатывает данные
  parse(constructor, instances) {
    for (const id in instances) {
      if (instances.hasOwnProperty(id)) {
        // если экземпляр существует - обновить
        if (this._model.read(constructor, id)) {
          this._model.update(constructor, id, instances[id]);

          // иначе, если есть данные для создания экземпляра - создать
        } else if (instances[id]) {
          this._model.create(constructor, id, instances[id]);
        }
      }
    }
  }

  // обновляет представление относительно пользователя
  update(coords, scale) {
    this._view.update(coords, scale);
  }

  // удаляет данные игры
  remove(constructor, id) {
    this._model.remove(constructor, id);
  }
}
