// функции-пекари
import bakers from './bakers/index.js';

// класс для управления "запеченными" ассетами
// каждый экземпляр управляет собственной изолированной коллекцией
export default class Baking {
  constructor() {
    // приватная коллекция для хранения "запеченных" компонентов
    this._collection = new Map();
  }

  // запекает компоненты по конфигу и сохраняет их во внутреннем хранилище
  // components - массив объектов с описанием компонентов из конфига
  // pixiApp - экземпляр PIXI приложения
  bakeAll(components, pixiApp) {
    const renderer = pixiApp.renderer;

    this._collection.clear();

    for (const component of components) {
      const bakerFn = bakers[component.type];

      if (bakerFn) {
        const bakedComponent = bakerFn(component.params, renderer);
        this._collection.set(component.id, bakedComponent);
      }
    }
  }

  // добавляет или заменяет один компонент в реестре
  // id - уникальный идентификатор компонента
  // component - компонент
  set(id, component) {
    this._collection.set(id, component);
  }

  // возвращает компонент по его ID
  get(id) {
    return this._collection.get(id);
  }

  // возвращает всю коллекцию "запеченных" ассетов
  getAssets() {
    return this._collection;
  }
}
