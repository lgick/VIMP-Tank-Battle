// Singleton Game
var p2 = require('p2');
var game;

function Game(Factory, parts, keys, shotTime) {
  var p
    , time;

  if (game) {
    return game;
  }

  game = this;

  this._Factory = Factory;
  this._Factory.add(parts.constructors);

  this._mapConstructor = parts.mapConstructor;
  this._models = parts.models;
  this._bullets = parts.bullets;

  this._keys = keys;
  this._shotTime = shotTime;

  this._world = new p2.World({
    gravity:[0, 0]
  });

  // данные карты
  this._map = null;

  // данные моделей
  this._modelData = {};

  // данные пуль
  this._bulletData = {};
  // созданные пули в момент времени (время: массив из id пуль)
  this._bulletsAtTime = {};
  // id для пуль
  this._currentBulletID = 0;
  // время жизни пули (текущее, минимальное, максимальное)
  this._bulletTime = this._minBulletTime = this._maxBulletTime = 1;

  // вычисление максимального времени жизни пули
  for (p in this._bullets) {
    if (this._bullets.hasOwnProperty(p)) {
      time = this._bullets[p].time * 2;

      if (time > this._maxBulletTime) {
        this._maxBulletTime = time;
      }
    }
  }

  time = this._maxBulletTime;

  // создание пустых данных пуль
  while (time >= this._minBulletTime) {
    this._bulletsAtTime[time] = [];
    time -= 1;
  }
}

// создает карту
Game.prototype.createMap = function (mapData) {
  this.clear();
  this._map = this._Factory(this._mapConstructor, {
    mapData: mapData,
    world: this._world
  });
};

// возвращает все данные динамических элементов
Game.prototype.getFullDynamicMapData = function () {
  return this._map.getFullDynamicMapData();
};

// возвращает данные динамических элементов
Game.prototype.getDynamicMapData = function () {
  return this._map.getDynamicMapData();
};

// сбрасывает динамические элементы в дефолтные данные
Game.prototype.resetDynamicMapData = function () {
  this._map.resetDynamic();
};

// создает игрока
Game.prototype.createUser = function (gameID, model, name, teamID, data) {
  var user
    , modelData = this._models[model];

  modelData.position = [data[0], data[1]];
  modelData.angle = data[2];

  user = this._modelData[gameID] = this._Factory(modelData.constructor, {
    keys: this._keys,
    modelData: modelData
  });

  user.gameID = gameID;
  user.model = model;
  user.name = name;
  user.teamID = teamID;
  user.fullUserData = true;

  user.bulletData = null;
  user.keys = null;
  user.currentBullet = modelData.currentBullet;
  user.bulletList = Object.keys(modelData.bullets);

  this._world.addBody(user.getBody());
};

// удаляет игрока
Game.prototype.removeUser = function (gameID) {
  // если игрок существует
  if (this._modelData[gameID]) {
    this._world.removeBody(this._modelData[gameID].getBody());
    delete this._modelData[gameID];
  }
};

// удаляет всех игроков
Game.prototype.removeUsers = function () {
  var gameID;

  for (gameID in this._modelData) {
    if (this._modelData.hasOwnProperty(gameID)) {
      this._world.removeBody(this._modelData[gameID].getBody());
      delete this._modelData[gameID];
    }
  }
};

// меняет игровую модель
Game.prototype.changeModel = function (gameID, model) {
};

// меняет команду игрока
Game.prototype.changeTeamID = function (gameID, teamID) {
  var user = this._modelData[gameID];

  user.teamID = teamID;
  user.fullUserData = true;
};

// меняет имя игрока
Game.prototype.changeName = function (gameID, name) {
  var user = this._modelData[gameID];

  user.name = name;
  user.fullUserData = true;
};

// обновляет нажатые клавиши
Game.prototype.updateKeys = function (gameID, keys) {
  this._modelData[gameID].keys = keys;
};

// возвращает координаты игрока
Game.prototype.getUserCoords = function (gameID) {
  var position = this._modelData[gameID].getBody().position;

  return [+position[0].toFixed(), +position[1].toFixed()];
};

// стирает данные игрового мира
Game.prototype.clear = function () {
  this._world.clear();
};

// обновляет данные
Game.prototype.updateData = function () {
  var p
    , user
    , keys;

  for (p in this._modelData) {
    if (this._modelData.hasOwnProperty(p)) {
      user = this._modelData[p];
      keys = user.keys;

      if (keys !== null) {
        if (keys & this._keys.nextBullet) {
          this.turnUserBullet(user.gameID);
        }

        if (keys & this._keys.prevBullet) {
          this.turnUserBullet(user.gameID, true);
        }

        user.updateData(keys);
        user.keys = null;
      }
    }
  }

  this._world.step(1 / this._shotTime);
};

// возвращает данные
Game.prototype.getGameData = function () {
  var user
    , model
    , p
    , gameData
    , bulletData
    , bulletName
    , bulletID
  ;

  // данные старых пуль
  gameData = this.getOldBulletData();

  for (p in this._modelData) {
    if (this._modelData.hasOwnProperty(p)) {
      user = this._modelData[p];
      model = user.model;
      bulletData = user.getBulletData();

      gameData[model] = gameData[model] || {};

      // если возврат полных данных
      if (user.fullUserData === true) {
        user.fullUserData = false;
        gameData[model][p] = user.getFullData([user.teamID, user.name]);
      } else {
        gameData[model][p] = user.getData();
      }

      // если есть данные для создания пули
      if (bulletData !== null) {
        bulletName = user.currentBullet;
        bulletID = this.createBullet(user.gameID, bulletName, bulletData);

        gameData[bulletName] = gameData[bulletName] || {};
        gameData[bulletName][bulletID] = bulletData;

        user.bulletData = null;
      }
    }
  }

  return gameData;
};

// возвращает полные данные всех игроков
Game.prototype.getFullUsersData = function () {
  var p
    , model
    , user
    , gameData = {};

  for (p in this._modelData) {
    if (this._modelData.hasOwnProperty(p)) {
      user = this._modelData[p];
      model = user.model;
      gameData[model] = gameData[model] || {};
      gameData[model][p] = user.getFullData([user.teamID, user.name]);
    }
  }

  return gameData;
};

// создает новую пулю и возвращает ее ID
Game.prototype.createBullet = function (gameID, bulletName, bulletData) {
  var bulletSet = this._bullets[bulletName]
    , time = this._bulletTime + bulletSet.time
    , bullet
    , bulletID;

  this._currentBulletID += 1;
  bulletID = this._currentBulletID.toString(36);

  if (time > this._maxBulletTime) {
    time = time - this._maxBulletTime;
  }

  bullet = this._bulletData[bulletID] = this._Factory(bulletSet.constructor, {
    set: bulletSet,
    data: bulletData
  });

  bullet.bulletName = bulletName;
  bullet.bulletID = bulletID;
  bullet.gameID = gameID;

  this._bulletsAtTime[time].push(bulletID);
  this._world.addBody(bullet.getBody());

  return bulletID;
};

// сбрасывает currentBulletID, удаляет и возвращает данные о всех пулях
Game.prototype.resetBulletData = function () {
  var p
    , bullet
    , bulletName
    , bulletID
    , i
    , len
    , arr
    , gameData = {};

  this._currentBulletID = 0;

  for (p in this._bulletsAtTime) {
    if (this._bulletsAtTime.hasOwnProperty(p)) {
      arr = this._bulletsAtTime[p];

      // очищение пуль
      for (i = 0, len = arr.length; i < len; i += 1) {
        bullet = this._bulletData[arr[i]];
        bulletName = bullet.bulletName;
        bulletID = bullet.bulletID;

        this._world.removeBody(bullet.getBody());

        gameData[bulletName] = gameData[bulletName] || {};
        gameData[bulletName][bulletID] = null;
      }

      this._bulletsAtTime[p] = [];
    }
  }

  return gameData;
};

// обновляет время и возвращает данные устаревших пуль
Game.prototype.getOldBulletData = function () {
  var oldBulletArr = this._bulletsAtTime[this._bulletTime]
    , i
    , len
    , bullet
    , bulletName
    , bulletID
    , gameData = {};

  this._bulletsAtTime[this._bulletTime] = [];

  this._bulletTime += 1;

  if (this._bulletTime > this._maxBulletTime) {
    this._bulletTime = this._minBulletTime;
  }

  for (i = 0, len = oldBulletArr.length; i < len; i += 1) {
    bullet = this._bulletData[oldBulletArr[i]];
    bulletName = bullet.bulletName;
    bulletID = bullet.bulletID;

    this._world.removeBody(bullet.getBody());

    gameData[bulletName] = gameData[bulletName] || {};
    gameData[bulletName][bulletID] = null;
  }

  return gameData;
};

// задает модель пуль игроку
Game.prototype.setUserBullet = function (gameID, bullet) {
  var user = this._modelData[gameID]
    , bulletList = user.bulletList;

  if (bulletList.indexOf(bullet) !== -1) {
    user.currentBullet = bullet;
  }
};

// меняет модель пуль игрока
Game.prototype.turnUserBullet = function (gameID, back) {
  var user = this._modelData[gameID]
    , bulletList = user.bulletList
    , key = bulletList.indexOf(user.currentBullet);

  // если назад
  if (back) {
    key -= 1;
  } else {
    key += 1;
  }

  if (key < 0) {
    key = bulletList.length - 1;
  } else if (key >= bulletList.length) {
    key = 0;
  }

  user.currentBullet = bulletList[key];
};

module.exports = Game;
