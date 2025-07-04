export default class DependencyProvider {
  constructor() {
    // приватное хранилище для подготовленных объектов зависимостей
    // Map<componentName, dependenciesObject>
    this._collection = new Map();
  }

  // собирает объекты зависимостей и упаковывает их для компонентов
  // availableServices - пул всех доступных сервисов
  // dependencyMap - карта, описывающая, какой компонент какой сервис требует
  collectAll(availableServices, dependencyMap) {
    this._collection.clear();

    const componentNames = Object.keys(dependencyMap || {});

    for (const componentName of componentNames) {
      const requiredKeys = dependencyMap[componentName] || [];
      const dependenciesForInstance = {};

      for (const key of requiredKeys) {
        if (Object.hasOwn(availableServices, key)) {
          dependenciesForInstance[key] = availableServices[key];
        }
      }

      this._collection.set(componentName, dependenciesForInstance);
    }
  }

  // возвращает всю коллекцию "собранных" зависимостей
  getDependenciesCollection() {
    return this._collection;
  }
}
