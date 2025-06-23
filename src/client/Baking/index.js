// функции-пекари
import bakers from './bakers/index.js';

// класс для управления "запеченными" ассетами
// каждый потребитель владеет собственной коллекцией ассетов
export default class Baking {
  constructor() {
    // коллекция для хранения "запеченных" ассетов
    // Map<constructor, assetsObject>
    this._collection = new Map();
  }

  // "запекает" ассеты и упаковывает их для потребителей
  // components - массив объектов с данными для создания ассетов
  // pixiApp - экземпляр PIXI приложения
  // dependenciesConfig - потребители ({потребитель: [список имён ассетов]})
  bakeAll(components, pixiApp, dependenciesConfig = {}) {
    const renderer = pixiApp.renderer;

    const bakedAssets = new Map(); // временное хранилище для ассетов
    bakedAssets.set('renderer', renderer); // accет рендерера

    this._collection.clear();

    // "запекание" ассетов
    for (const component of components) {
      const bakerFn = bakers[component.type];

      if (bakerFn) {
        bakedAssets.set(component.id, bakerFn(component.params, renderer));
      }
    }

    // сборка ассетов под потребителя согласно конфигу
    for (const constructor in dependenciesConfig) {
      if (Object.hasOwn(dependenciesConfig, constructor)) {
        const assetList = dependenciesConfig[constructor];
        const assets = {};

        for (const asset of assetList) {
          if (bakedAssets.has(asset)) {
            assets[asset] = bakedAssets.get(asset);
          }
        }

        this._collection.set(constructor, assets);
      }
    }
  }

  // возвращает всю коллекцию "запеченных" ассетов
  getAssetsCollection() {
    return this._collection;
  }
}
