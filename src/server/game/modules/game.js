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
    this._weapons = parts.weapons;

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
    this._shotsData = {};

    // созданные пули в момент времени (время: массив из id пуль)
    this._shotsAtTime = {};

    // id для пуль
    this._currentShotID = 0;

    // время жизни пули (текущее, минимальное, максимальное)
    this._shotTime = this._minShotTime = this._maxShotTime = 1;

    // вычисление максимального времени жизни пули
    for (const weapon in this._weapons) {
      if (this._weapons.hasOwnProperty(weapon)) {
        time = this._weapons[weapon].time * 2;

        if (time > this._maxShotTime) {
          this._maxShotTime = time;
        }
      }
    }

    time = this._maxShotTime;

    // создание пустых данных пуль
    while (time >= this._minShotTime) {
      this._shotsAtTime[time] = [];
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
      currentWeapon: modelData.currentWeapon,
      availableWeaponList: Object.keys(modelData.bullets),
      weapons: this._weapons,
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
    const gameData = this.getOldShotData();

    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;
        const shotData = player.getShotData();

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = player.getData();

        // если есть данные для создания пули
        if (shotData !== null) {
          const weaponName = player.currentWeapon;
          const shot = this.createShot(player.gameID, weaponName, shotData);

          gameData[weaponName] = gameData[weaponName] || {};
          gameData[weaponName][shot.shotID] = shot.getData();

          player.shotData = null;
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
  createShot(gameID, weaponName, shotData) {
    const weaponData = this._weapons[weaponName];
    let time = this._shotTime + weaponData.time;

    this._currentShotID += 1;
    const shotID = this._currentShotID.toString(36);

    if (time > this._maxShotTime) {
      time = time - this._maxShotTime;
    }

    const shot = (this._shotsData[shotID] = this._Factory(
      weaponData.constructor,
      {
        weaponData,
        shotData,
        world: this._world,
      },
    ));

    shot.weaponName = weaponName;
    shot.shotID = shotID;
    shot.gameID = gameID;

    this._shotsAtTime[time].push(shotID);

    return shot;
  }

  // удаляет данные игроков и пуль и возвращает список удалённых имён
  removePlayersAndShots() {
    return [...this.removePlayers(), ...this.removeShots()];
  }

  // сбрасывает currentShotID, удаляет все пули и возвращает список удаленных имён
  removeShots() {
    const shotNameSet = new Set();

    this._currentShotID = 0;

    for (const time in this._shotsAtTime) {
      if (this._shotsAtTime.hasOwnProperty(time)) {
        const arr = this._shotsAtTime[time];

        // очищение пуль
        for (let i = 0, len = arr.length; i < len; i += 1) {
          const shot = this._shotsData[arr[i]];

          shotNameSet.add(shot.shotName);
          this._world.destroyBody(shot.getBody());
        }

        this._shotsAtTime[time] = [];
      }
    }

    return [...shotNameSet];
  }

  // обновляет время и возвращает данные устаревших пуль
  getOldShotData() {
    const oldShotArr = this._shotsAtTime[this._shotTime];
    const gameData = {};

    this._shotsAtTime[this._shotTime] = [];
    this._shotTime += 1;

    if (this._shotTime > this._maxShotTime) {
      this._shotTime = this._minShotTime;
    }

    for (let i = 0, len = oldShotArr.length; i < len; i += 1) {
      const shot = this._shotsData[oldShotArr[i]];
      const shotName = shot.shotName;
      const shotID = shot.shotID;

      this._world.destroyBody(shot.getBody());

      gameData[shotName] = gameData[shotName] || {};
      gameData[shotName][shotID] = null;
    }

    return gameData;
  }
}

export default Game;
