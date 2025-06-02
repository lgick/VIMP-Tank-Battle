// Контроллер игры

export default class GameCtrl {
  constructor(model, view) {
    this._model = model;
    this._view = view;

    this._vPublic = view.publisher;

    this._vPublic.on('renderEnd', 'runEffects', this);
  }

  // обрабатывает данные
  parse(constructor, instances) {
    // если массив (без id) - это эффекты, которые проигрываются и самоуничтожаются
    if (Array.isArray(instances)) {
      for (let i = 0, len = instances.length; i < len; i += 1) {
        this._model.createEffect(constructor, instances[i]);
      }
    } else {
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
  }

  // обновляет представление относительно пользователя
  update(coords, scale) {
    this._view.update(coords, scale);
  }

  // запускает эффекты (по событию, после добавления их на полотно)
  runEffects() {
    this._model.runEffects();
  }

  // удаляет данные игры
  remove(constructor, id) {
    this._model.remove(constructor, id);
  }
}
