import planck from 'planck';

// Singleton Game
let game;

class Game {
  constructor(Factory, parts, keys, shotTime) {
    let time;

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

    this._world = new planck.World({
      gravity: { x: 0, y: 0 },
      allowSleep: true,
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
    for (const p in this._bullets) {
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
  createMap(mapData) {
    this.clear();
    this._map = this._Factory(this._mapConstructor, {
      mapData,
      world: this._world,
    });
  }

  // возвращает все данные динамических элементов
  getFullDynamicMapData() {
    return this._map.getFullDynamicMapData();
  }

  // возвращает данные динамических элементов
  getDynamicMapData() {
    return this._map.getDynamicMapData();
  }

  // сбрасывает динамические элементы в дефолтные данные
  resetDynamicMapData() {
    this._map.resetDynamic();
  }

  // создает игрока
  createUser(gameID, model, name, teamID, data) {
    const modelData = this._models[model];

    modelData.position = [data[0], data[1]];
    modelData.angle = data[2];

    const user = (this._modelData[gameID] = this._Factory(
      modelData.constructor,
      {
        keys: this._keys,
        modelData,
      },
    ));

    user.gameID = gameID;
    user.model = model;
    user.name = name;
    user.teamID = teamID;
    user.fullUserData = true;

    user.bulletData = null;
    user.keys = null;
    user.currentBullet = modelData.currentBullet;
    user.bulletList = Object.keys(modelData.bullets);

    user.initBody(this._world);
  }

  // удаляет игрока
  removeUser(gameID) {
    // если игрок существует
    if (this._modelData[gameID]) {
      this._world.destroyBody(this._modelData[gameID].getBody());
      delete this._modelData[gameID];
    }
  }

  // удаляет всех игроков
  removeUsers() {
    for (const gameID in this._modelData) {
      if (this._modelData.hasOwnProperty(gameID)) {
        this._world.destroyBody(this._modelData[gameID].getBody());
        delete this._modelData[gameID];
      }
    }
  }

  // меняет игровую модель
  changeModel(gameID, model) {}

  // меняет команду игрока
  changeTeamID(gameID, teamID) {
    const user = this._modelData[gameID];

    user.teamID = teamID;
    user.fullUserData = true;
  }

  // меняет имя игрока
  changeName(gameID, name) {
    const user = this._modelData[gameID];

    user.name = name;
    user.fullUserData = true;
  }

  // обновляет нажатые клавиши
  updateKeys(gameID, keys) {
    this._modelData[gameID].keys = keys;
  }

  // возвращает координаты игрока
  getUserCoords(gameID) {
    const position = this._modelData[gameID].getBody().getPosition();

    return [+position.x.toFixed(), +position.y.toFixed()];
  }

  // стирает данные игрового мира
  clear() {
    // Сначала сбрасываем силы
    this._world.clearForces();

    // Затем удаляем все тела
    let body = this._world.getBodyList();

    while (body) {
      const nextBody = body.getNext();
      this._world.destroyBody(body);
      body = nextBody;
    }
  }

  // обновляет данные
  updateData() {
    for (const p in this._modelData) {
      if (this._modelData.hasOwnProperty(p)) {
        const user = this._modelData[p];
        const keys = user.keys;

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

    const velocityIterations = 10;
    const positionIterations = 8;

    this._world.step(this._shotTime, velocityIterations, positionIterations);
  }

  // возвращает данные
  getGameData() {
    // данные старых пуль
    const gameData = this.getOldBulletData();

    for (const p in this._modelData) {
      if (this._modelData.hasOwnProperty(p)) {
        const user = this._modelData[p];
        const model = user.model;
        const bulletData = user.getBulletData();

        gameData[model] = gameData[model] || {};

        // если возврат полных данных
        if (user.fullUserData === true) {
          user.fullUserData = false;
          gameData[model][p] = user.getFullData(user.teamID, user.name);
        } else {
          gameData[model][p] = user.getData();
        }

        // если есть данные для создания пули
        if (bulletData !== null) {
          const bulletName = user.currentBullet;
          const bullet = this.createBullet(user.gameID, bulletName, bulletData);

          gameData[bulletName] = gameData[bulletName] || {};
          gameData[bulletName][bullet.bulletID] = bullet.getData();

          user.bulletData = null;
        }
      }
    }

    return gameData;
  }

  // возвращает полные данные всех игроков
  getFullUsersData() {
    const gameData = {};

    for (const p in this._modelData) {
      if (this._modelData.hasOwnProperty(p)) {
        const user = this._modelData[p];
        const model = user.model;

        gameData[model] = gameData[model] || {};
        gameData[model][p] = user.getFullData(user.teamID, user.name);
      }
    }

    return gameData;
  }

  // создает новую пулю и возвращает ее
  createBullet(gameID, bulletName, bulletData) {
    const bulletSet = this._bullets[bulletName];
    let time = this._bulletTime + bulletSet.time;

    this._currentBulletID += 1;
    const bulletID = this._currentBulletID.toString(36);

    if (time > this._maxBulletTime) {
      time = time - this._maxBulletTime;
    }

    const bullet = (this._bulletData[bulletID] = this._Factory(
      bulletSet.constructor,
      {
        bulletSet,
        bulletData,
      },
    ));

    bullet.bulletName = bulletName;
    bullet.bulletID = bulletID;
    bullet.gameID = gameID;

    bullet.initBody(this._world);

    this._bulletsAtTime[time].push(bulletID);

    return bullet;
  }

  // сбрасывает currentBulletID, удаляет и возвращает данные о всех пулях
  resetBulletData() {
    const gameData = {};

    this._currentBulletID = 0;

    for (const p in this._bulletsAtTime) {
      if (this._bulletsAtTime.hasOwnProperty(p)) {
        const arr = this._bulletsAtTime[p];

        // очищение пуль
        for (let i = 0, len = arr.length; i < len; i += 1) {
          const bullet = this._bulletData[arr[i]];
          const bulletName = bullet.bulletName;
          const bulletID = bullet.bulletID;

          this._world.destroyBody(bullet.getBody());

          gameData[bulletName] = gameData[bulletName] || {};
          gameData[bulletName][bulletID] = null;
        }

        this._bulletsAtTime[p] = [];
      }
    }

    return gameData;
  }

  // обновляет время и возвращает данные устаревших пуль
  getOldBulletData() {
    const oldBulletArr = this._bulletsAtTime[this._bulletTime];
    const gameData = {};

    this._bulletsAtTime[this._bulletTime] = [];
    this._bulletTime += 1;

    if (this._bulletTime > this._maxBulletTime) {
      this._bulletTime = this._minBulletTime;
    }

    for (let i = 0, len = oldBulletArr.length; i < len; i += 1) {
      const bullet = this._bulletData[oldBulletArr[i]];
      const bulletName = bullet.bulletName;
      const bulletID = bullet.bulletID;

      this._world.destroyBody(bullet.getBody());

      gameData[bulletName] = gameData[bulletName] || {};
      gameData[bulletName][bulletID] = null;
    }

    return gameData;
  }

  // задает модель пуль игроку
  setUserBullet(gameID, bullet) {
    const user = this._modelData[gameID];
    const bulletList = user.bulletList;

    if (bulletList.indexOf(bullet) !== -1) {
      user.currentBullet = bullet;
    }
  }

  // меняет модель пуль игрока
  turnUserBullet(gameID, back) {
    const user = this._modelData[gameID];
    const bulletList = user.bulletList;
    let key = bulletList.indexOf(user.currentBullet);

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
  }
}

export default Game;
