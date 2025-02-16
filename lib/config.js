const config = {};

// добавляет новое значение в config
// keys:
// может иметь несколько вложенностей
// вложенности разделять ':', например:
// key1:key2:key3 будет значением config[key1][key2][key3]
// value:
// может быть значением любого типа
function set(keys, value) {
  if (!keys) {
    return;
  }

  const arr = keys.split(':');

  function getProperty(arr, stack, value) {
    const key = arr.shift();

    if (arr.length) {
      stack[key] = stack[key] ? stack[key] : {};
      getProperty(arr, stack[key], value);
    } else {
      stack[key] = value;
    }
  }
  getProperty(arr, config, value);
}

// возвращает значение по ключу, ключ может иметь несколько вложенностей
// вложенности разделять ':', например:
// key1:key2:key3 вернет значение config[key1][key2][key3]
// вызов без аргументов вернет весь конфиг
function get(keys) {
  if (!keys) {
    return config;
  }

  const arr = keys.split(':');
  let value;

  for (let i = 0, len = arr.length; i < len; i += 1) {
    const stack = value || config;

    // если поиск свойства не в объекте
    if (typeof stack !== 'object') {
      value = stack + ' is not object';
      console.log(value);
      return value;
    }

    // если свойство есть в объекте
    if (arr[i] in stack) {
      value = stack[arr[i]];
    } else {
      value = arr[i] + ' is not property';
      console.log(value);
      return value;
    }
  }

  return value;
}

export default {
  set,
  get,
};
