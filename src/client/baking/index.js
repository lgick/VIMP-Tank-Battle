// функции-пекари
import bakers from './bakers/index.js';

// приватная коллекция для хранения "запеченных" компонентов
let collection = new Map();

export default {
  // запекает компоненты по конфигу и сохраняет их во внутреннем хранилище
  // components - массив объектов с описанием компонентов из конфига
  // pixiApp - экземпляр PIXI приложения
  bakeAll(components, pixiApp) {
    const bakedCollection = new Map();
    const renderer = pixiApp.renderer;

    for (const component of components) {
      const bakerFn = bakers[component.type];

      if (bakerFn) {
        const bakedComponent = bakerFn(component.params, renderer);
        bakedCollection.set(component.id, bakedComponent);
      } else {
        console.warn(
          `Пекарь для компонента типа "${component.type}" не найден.`,
        );
      }
    }

    collection = bakedCollection;
  },

  // добавляет или заменяет один компонент в реестре
  // id - уникальный идентификатор компонента
  // component - компонент
  set(id, component) {
    collection.set(id, component);
  },

  // возвращает компонент по его ID
  get(id) {
    const component = collection.get(id);

    if (!component) {
      console.error(`Компонент с ID "${id}" не найден в реестре.`);
    }

    return component;
  },
};
