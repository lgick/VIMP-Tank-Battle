// Фабрика для строительства объектов игры
// создает объект игры указанного типа
// по заданным параметрам
const Factory = (name, params) => {
  const Constructor = Factory.constructors[name];

  if (typeof Constructor !== 'function') {
    throw new Error(`Constructor for ${name} not found.`);
  }

  return new Constructor(params);
};

Factory.constructors = {};

// добавление конструкторов
Factory.add = data => {
  Object.assign(Factory.constructors, data);
};

export default Factory;
