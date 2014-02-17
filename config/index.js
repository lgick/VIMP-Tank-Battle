var path = require('path');
var log = require('../lib/log')(module);
var config = {};


// добавляет новое значение в config
// keys:
// может иметь несколько вложенностей
// вложенности разделять ':', например:
// key1:key2:key3 будет значением config[key1][key2][key3]
// value:
// может быть значением любого типа
exports.set = function (keys, value) {
  if (!keys) {
    return;
  }

  var arr = keys.split(':');

  function getProperty(arr, stack, value) {
    var key = arr.shift();

    if (arr.length) {
      stack[key] = stack[key] ? stack[key] : {};
      getProperty(arr, stack[key], value);
    } else {
      stack[key] = value;
    }
  }

  getProperty(arr, config, value);
};


// возвращает значение по ключу, ключ может иметь несколько вложенностей
// вложенности разделять ':', например:
// key1:key2:key3 вернет значение config[key1][key2][key3]
// вызов без аргументов вернет весь конфиг
exports.get = function (keys) {
  if (!keys) {
    return config;
  }

  var arr = keys.split(':');
  var value;

  for (var i = 0, len = arr.length; i < len; i += 1) {
    var stack = value || config;

    // если поиск свойства не в объекте
    if (typeof stack !== 'object') {
      value = stack + ' is not object'
      log.error(value);
      return value;
    }

    // если свойство есть в объекте
    if (arr[i] in stack) {
      value = stack[arr[i]];
    } else {
      value = arr[i] + ' is not property';
      log.error(value);
      return value;
    }
  }

  return value;
};
