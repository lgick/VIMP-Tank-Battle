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
  // arr - массив объектов с данными для создания ассетов
  // pixiApp - экземпляр PIXI приложения
  bakeAll(arr, pixiApp) {
    const renderer = pixiApp.renderer;

    this._collection.clear();

    // "запекание" ассетов
    for (const data of arr) {
      const bakerFn = bakers[data.baker];

      if (bakerFn) {
        // "запекаем" ассет
        const bakedAsset = bakerFn(data.params, renderer);

        // получаем имя компонента и ID ассета из конфига
        const componentName = data.component;
        const assetId = data.id;

        // если для этого компонента еще нет контейнера ассетов, создаем его
        if (!this._collection.has(componentName)) {
          this._collection.set(componentName, {});
        }

        // добавляем "запеченный" ассет в контейнер соответствующего компонента
        const assetsContainer = this._collection.get(componentName);
        assetsContainer[assetId] = bakedAsset;
      }
    }
  }

  // возвращает всю коллекцию "запеченных" ассетов
  getAssetsCollection() {
    return this._collection;
  }
}
