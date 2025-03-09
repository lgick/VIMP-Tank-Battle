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

    this._keysData = keys;
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

    this._modelData[gameID] = this._Factory(modelData.constructor, {
      keysData: this._keysData,
      modelData,
      world: this._world,
      model,
      name,
      teamID,
      currentBullet: modelData.currentBullet,
      bulletList: Object.keys(modelData.bullets),
      bullets: this._bullets,
    });
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

  // меняет имя игрока
  changeName(gameID, name) {
    if (this._modelData[gameID]) {
      this._modelData[gameID].changeName(name);
    }
  }

  // обновляет нажатые клавиши
  updateKeys(gameID, keys) {
    this._modelData[gameID].currentKeys = keys;
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
        this._modelData[p].updateData();
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
        gameData[model][p] = user.getData();

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
        gameData[model][p] = user.getFullData();
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
        world: this._world,
      },
    ));

    bullet.bulletName = bulletName;
    bullet.bulletID = bulletID;
    bullet.gameID = gameID;

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
}

export default Game;
