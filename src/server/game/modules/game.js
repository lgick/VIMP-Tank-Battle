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

    // интервал фиксированного шага физики (в секундах, например 1 / 120)
    this._timeStep = shotTime;
    this._velocityIterations = 10;
    this._positionIterations = 8;
    this._accumulator = 0;

    this._world = new planck.World({
      gravity: { x: 0, y: 0 },
      allowSleep: true,
    });

    // конструктор карт
    this._map = this._Factory(this._mapConstructor, this._world);

    // данные игроков
    this._playersData = {};

    // данные пуль
    this._bulletsData = {};

    // созданные пули в момент времени (время: массив из id пуль)
    this._bulletsAtTime = {};

    // id для пуль
    this._currentBulletID = 0;

    // время жизни пули (текущее, минимальное, максимальное)
    this._bulletTime = this._minBulletTime = this._maxBulletTime = 1;

    // вычисление максимального времени жизни пули
    for (const bullet in this._bullets) {
      if (this._bullets.hasOwnProperty(bullet)) {
        time = this._bullets[bullet].time * 2;

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
    this._map.createMap(mapData);
  }

  // возвращает данные динамических элементов
  getDynamicMapData() {
    return this._map.getDynamicMapData();
  }

  // создает игрока
  createPlayer(gameID, model, name, teamID, data) {
    const modelData = this._models[model];

    modelData.position = [data[0], data[1]];
    modelData.angle = data[2];

    this._playersData[gameID] = this._Factory(modelData.constructor, {
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
  removePlayer(gameID) {
    // если игрок существует
    if (this._playersData[gameID]) {
      this._world.destroyBody(this._playersData[gameID].getBody());
      delete this._playersData[gameID];
    }
  }

  // удаляет всех игроков и возвращает список удаленных моделей
  removePlayers() {
    const modelNameSet = new Set();

    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        const player = this._playersData[gameID];

        modelNameSet.add(player.model);
        this._world.destroyBody(player.getBody());
        delete this._playersData[gameID];
      }
    }

    return [...modelNameSet];
  }

  // меняет имя игрока
  changeName(gameID, name) {
    if (this._playersData[gameID]) {
      this._playersData[gameID].changeName(name);
    }
  }

  // обновляет нажатые клавиши
  updateKeys(gameID, keys) {
    this._playersData[gameID].currentKeys = keys;
  }

  // возвращает координаты игрока
  getPlayerCoords(gameID) {
    const position = this._playersData[gameID].getBody().getPosition();

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

  // обновляет данные физики
  updateData(dt) {
    // обновляем модели игроков
    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        this._playersData[gameID].updateData(dt);
      }
    }

    // накапливаем прошедшее время
    this._accumulator += dt;

    // делаем столько фиксированных шагов, сколько нужно
    while (this._accumulator >= this._timeStep) {
      this._world.step(
        this._timeStep,
        this._velocityIterations,
        this._positionIterations,
      );

      this._accumulator -= this._timeStep;
    }
  }

  // возвращает данные
  getGameData() {
    // данные старых пуль
    const gameData = this.getOldBulletData();

    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;
        const bulletData = player.getBulletData();

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = player.getData();

        // если есть данные для создания пули
        if (bulletData !== null) {
          const bulletName = player.currentBullet;
          const bullet = this.createBullet(
            player.gameID,
            bulletName,
            bulletData,
          );

          gameData[bulletName] = gameData[bulletName] || {};
          gameData[bulletName][bullet.bulletID] = bullet.getData();

          player.bulletData = null;
        }
      }
    }

    return gameData;
  }

  // возвращает полные данные всех игроков
  getFullPlayersData() {
    const gameData = {};

    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = player.getFullData();
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

    const bullet = (this._bulletsData[bulletID] = this._Factory(
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

  // удаляет данные игроков и пуль и возвращает список удалённых имён
  removePlayersAndBullets() {
    return [...this.removePlayers(), ...this.removeBullets()];
  }

  // сбрасывает currentBulletID, удаляет все пули и возвращает список удаленных имён
  removeBullets() {
    const bulletNameSet = new Set();

    this._currentBulletID = 0;

    for (const time in this._bulletsAtTime) {
      if (this._bulletsAtTime.hasOwnProperty(time)) {
        const arr = this._bulletsAtTime[time];

        // очищение пуль
        for (let i = 0, len = arr.length; i < len; i += 1) {
          const bullet = this._bulletsData[arr[i]];

          bulletNameSet.add(bullet.bulletName);
          this._world.destroyBody(bullet.getBody());
        }

        this._bulletsAtTime[time] = [];
      }
    }

    return [...bulletNameSet];
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
      const bullet = this._bulletsData[oldBulletArr[i]];
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
