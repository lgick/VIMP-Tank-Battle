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

  this._map = null;
  this._users = {};

  // созданные пули в момент времени (время: массив пуль)
  this._bulletData = {};
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

  // создание пустых данных
  while (time >= this._minBulletTime) {
    this._bulletData[time] = [];
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

  user = this._users[gameID] = this._Factory(modelData.constructor, {
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
  if (this._users[gameID]) {
    this._world.removeBody(this._users[gameID].getBody());
    delete this._users[gameID];
  }
};

// удаляет всех игроков
Game.prototype.removeUsers = function () {
  var gameID;

  for (gameID in this._users) {
    if (this._users.hasOwnProperty(gameID)) {
      this._world.removeBody(this._users[gameID].getBody());
      delete this._users[gameID];
    }
  }
};

// меняет игровую модель
Game.prototype.changeModel = function (gameID, model) {
};

// меняет команду игрока
Game.prototype.changeTeamID = function (gameID, teamID) {
  var user = this._users[gameID];

  user.teamID = teamID;
  user.fullUserData = true;
};

// меняет имя игрока
Game.prototype.changeName = function (gameID, name) {
  var user = this._users[gameID];

  user.name = name;
  user.fullUserData = true;
};

// обновляет нажатые клавиши
Game.prototype.updateKeys = function (gameID, keys) {
  this._users[gameID].keys = keys;
};

// возвращает координаты игрока
Game.prototype.getUserCoords = function (gameID) {
  var position = this._users[gameID].getBody().position;

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

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];
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

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];
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
        gameData[bulletName][bulletID] = [/* TODO */];

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

  for (p in this._users) {
    if (this._users.hasOwnProperty(p)) {
      user = this._users[p];
      model = user.model;
      gameData[model] = gameData[model] || {};
      gameData[model][p] = user.getFullData([user.teamID, user.name]);
    }
  }

  return gameData;
};

// создает новую пулю и возвращает ее ID
Game.prototype.createBullet = function (gameID, bulletName, bulletData) {
  var time = this._bulletTime + this._bullets[bulletName].time
    , bulletBody
    , bulletShape
    , bulletID;

  bulletBody = new p2.Body({
    mass: 0.05,
    position: bulletData.position,
    velocity: bulletData.velocity,
    angle: bulletData.angle
  });

  bulletBody.damping = bulletBody.angularDamping = 0;

  bulletShape = new p2.Circle(3);
  bulletShape.collisionGroup = Math.pow(2, 2);
  bulletShape.collisionMask = Math.pow(2, 3);

  bulletBody.addShape(bulletShape);

  this._currentBulletID += 1;
  bulletID = this._currentBulletID.toString(36);

  if (time > this._maxBulletTime) {
    time = time - this._maxBulletTime;
  }

  this._world.addBody(bulletBody);
  this._bulletData[time].push([bulletName, bulletID, bulletBody, gameID]);

  return bulletID;
};

// сбрасывает currentBulletID, удаляет и возвращает данные о всех пулях
Game.prototype.resetBulletData = function () {
  var p
    , bulletName
    , bulletID
    , bulletBody
    , gameID
    , i
    , len
    , arr = []
    , gameData = {};

  this._currentBulletID = 0;

  for (p in this._bulletData) {
    if (this._bulletData.hasOwnProperty(p)) {
      arr = this._bulletData[p];

      // очищение пуль
      for (i = 0, len = arr.length; i < len; i += 1) {
        bulletName = arr[i][0];
        bulletID = arr[i][1];
        bulletBody = arr[i][2];
        gameID = arr[i][3];

        this._world.removeBody(bulletBody);

        gameData[bulletName] = gameData[bulletName] || {};
        gameData[bulletName][bulletID] = null;
      }

      this._bulletData[p] = [];
    }
  }

  return gameData;
};

// обновляет время и возвращает данные устаревших пуль
Game.prototype.getOldBulletData = function () {
  var oldBulletArr = this._bulletData[this._bulletTime]
    , i
    , len
    , bulletName
    , bulletID
    , bulletBody
    , gameData = {};

  this._bulletData[this._bulletTime] = [];

  this._bulletTime += 1;

  if (this._bulletTime > this._maxBulletTime) {
    this._bulletTime = this._minBulletTime;
  }

  for (i = 0, len = oldBulletArr.length; i < len; i += 1) {
    bulletName = oldBulletArr[i][0];
    bulletID = oldBulletArr[i][1];
    bulletBody = oldBulletArr[i][2];

    this._world.removeBody(bulletBody);

    gameData[bulletName] = gameData[bulletName] || {};
    gameData[bulletName][bulletID] = null;
  }

  return gameData;
};

// задает модель пуль игроку
Game.prototype.setUserBullet = function (gameID, bullet) {
  var user = this._users[gameID]
    , bulletList = user.bulletList;

  if (bulletList.indexOf(bullet) !== -1) {
    user.currentBullet = bullet;
  }
};

// меняет модель пуль игрока
Game.prototype.turnUserBullet = function (gameID, back) {
  var user = this._users[gameID]
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
