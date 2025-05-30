import planck from 'planck';

// Singleton Game
let game;

class Game {
  constructor(Factory, parts, keys, timeStep) {
    if (game) {
      return game;
    }

    game = this;

    this._Factory = Factory;
    this._Factory.add(parts.constructors);

    this._models = parts.models;
    this._weapons = parts.weapons;

    this._keysData = keys;

    // интервал фиксированного шага физики (в секундах, например 1 / 120)
    this._timeStep = timeStep;
    this._velocityIterations = 10;
    this._positionIterations = 8;
    this._accumulator = 0;

    this._world = new planck.World({
      gravity: { x: 0, y: 0 },
      allowSleep: true,
    });

    // конструктор карт
    this._map = this._Factory(parts.mapConstructor, this._world);

    // сервис вычисления hitscan выстрелов
    this._hitscanService = this._Factory(parts.hitscanService, {
      world: this._world,
      weapons: this._weapons,
      friendlyFire: parts.friendlyFire,
    });

    // данные игроков
    this._playersData = {};

    // общий список активных пуль { shotID: shotObject }
    this._shotsData = {};

    // созданные пули в момент времени (кольцевой буфер)
    // { stepTick: [shotID1, shotID2] }
    this._shotsAtTime = {};

    // id для пуль
    this._currentShotID = 0;

    // инициализация времени жизни пуль и кольцевого буфера
    let maxLifetimeMs = 0;

    for (const weaponName in this._weapons) {
      if (this._weapons.hasOwnProperty(weaponName)) {
        const weapon = this._weapons[weaponName];
        const time = weapon.time; // время жизни в ms

        if (time > maxLifetimeMs) {
          maxLifetimeMs = time;
        }
      }
    }

    // если пули часто уничтожаются досрочно, большой запас не так критичен,
    // уменьшение буфера до x1.5
    const maxLifetimeWithBufferSeconds = (maxLifetimeMs / 1000.0) * 1.5;

    // максимальное количество шагов в кольцевом буфере
    this._maxShotTimeInSteps = Math.ceil(
      maxLifetimeWithBufferSeconds / this._timeStep,
    );

    if (this._maxShotTimeInSteps < 1) {
      this._maxShotTimeInSteps = 1; // минимум 1 шаг
    }

    // текущий тик для кольцевого буфера, от 0 до _maxShotTimeInSteps-1
    this._currentStepTick = 0;

    for (let i = 0; i < this._maxShotTimeInSteps; i++) {
      this._shotsAtTime[i] = [];
    }

    // хранение данных об удаленных пулях между updateData и getGameData
    this._lastExpiredOrCollidedShotsData = {};
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
      gameID,
      teamID,
      currentWeapon: modelData.currentWeapon,
      availableWeaponList: Object.keys(modelData.ammo),
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

  // удаляет всех игроков и возвращает список удаленных моделей (игроков, дыма)
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
    // сброс сил
    this._world.clearForces();

    // процесс удаления всех тел
    let body = this._world.getBodyList();

    while (body) {
      const nextBody = body.getNext();
      this._world.destroyBody(body);
      body = nextBody;
    }

    this._playersData = {};
    this.removeShots();
    this._lastExpiredOrCollidedShotsData = {};
    this._accumulator = 0;
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
      // пули, чье время жизни истекло на этом шаге
      const expiredByTimeData = this.processShotsExpiredByTime();
      this.mergeShotOutcomeData(expiredByTimeData);

      this._world.step(
        this._timeStep,
        this._velocityIterations,
        this._positionIterations,
      );

      this._accumulator -= this._timeStep;
    }
  }

  // вспомогательный метод для слияния данных об исходе пуль
  mergeShotOutcomeData(newData) {
    for (const weaponName in newData) {
      if (newData.hasOwnProperty(weaponName)) {
        this._lastExpiredOrCollidedShotsData[weaponName] =
          this._lastExpiredOrCollidedShotsData[weaponName] || {};

        for (const shotID in newData[weaponName]) {
          if (newData[weaponName].hasOwnProperty(shotID)) {
            this._lastExpiredOrCollidedShotsData[weaponName][shotID] =
              newData[weaponName][shotID];
          }
        }
      }
    }
  }

  // обрабатывает пули, чье время жизни истекло
  processShotsExpiredByTime() {
    const shotsInCurrentTick = this._shotsAtTime[this._currentStepTick];
    const outcomeData = {};

    for (let i = 0, len = shotsInCurrentTick.length; i < len; i += 1) {
      const shotID = shotsInCurrentTick[i];
      const shot = this._shotsData[shotID];

      // если пуля все еще существует (не была уничтожена досрочно)
      if (shot) {
        const weaponName = shot.weaponName;

        this._world.destroyBody(shot.getBody());
        delete this._shotsData[shotID];

        outcomeData[weaponName] = outcomeData[weaponName] || {};
        outcomeData[weaponName][shotID] = null; // помечаем как удаленную по времени
      }
    }

    this._shotsAtTime[this._currentStepTick] = []; // очищаем текущий слот
    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps; // переходим к следующему слоту

    return outcomeData;
  }

  // возвращает данные
  getGameData() {
    const gameData = { ...this._lastExpiredOrCollidedShotsData };

    this._lastExpiredOrCollidedShotsData = {};

    for (const gameID in this._playersData) {
      if (this._playersData.hasOwnProperty(gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;
        const { playerData, shotData } = player.getData();

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = playerData;

        // если есть данные для создания пули
        if (shotData !== null) {
          const weaponName = player.currentWeapon;
          const shot = this.createShot(gameID, weaponName, shotData);

          gameData[weaponName] = gameData[weaponName] || {};
          gameData[weaponName][shot.shotID] = shot.getData();
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
    const lifetimeMs = weaponData.time;
    const lifetimeSeconds = lifetimeMs / 1000.0;
    let lifetimeInSteps = Math.ceil(lifetimeSeconds / this._timeStep);

    if (lifetimeInSteps < 1) {
      lifetimeInSteps = 1;
    }

    // ограничиваем максимальным временем буфера, если необходимо
    // (_maxShotTimeInSteps уже учитывает запас, но для безопасности)
    if (lifetimeInSteps >= this._maxShotTimeInSteps) {
      lifetimeInSteps = this._maxShotTimeInSteps - 1; // -1 чтобы точно попасть в буфер, т.к. он от 0 до M-1

      if (lifetimeInSteps < 0) {
        lifetimeInSteps = 0; // на случай если _maxShotTimeInSteps = 1
      }
    }

    this._currentShotID += 1;
    const shotID = this._currentShotID.toString(36);

    // слот, в который будет помещена пуля для удаления
    const removalTick =
      (this._currentStepTick + lifetimeInSteps) % this._maxShotTimeInSteps;

    const shot = this._Factory(weaponData.constructor, {
      weaponData,
      shotData,
      userData: {
        weaponName,
        shotID,
        ownerGameID: gameID,
      },
      world: this._world,
    });

    this._shotsData[shotID] = shot;

    shot.weaponName = weaponName;
    shot.shotID = shotID;
    shot.gameID = gameID;

    this._shotsAtTime[removalTick].push(shotID);

    return shot;
  }

  // удаляет данные игроков и пуль и возвращает список удалённых имён
  removePlayersAndShots() {
    return [...this.removePlayers(), ...this.removeShots()];
  }

  // сбрасывает currentShotID, удаляет все пули и возвращает список удаленных имён
  removeShots() {
    const weaponNameSet = new Set();

    this._currentShotID = 0;

    for (const shotID in this._shotsData) {
      // итерируем по актуальным пулям
      if (this._shotsData.hasOwnProperty(shotID)) {
        const shot = this._shotsData[shotID];

        weaponNameSet.add(shot.weaponName);
        this._world.destroyBody(shot.getBody());
      }
    }

    this._shotsData = {};

    // очистка кольцевого буфера
    for (let i = 0; i < this._maxShotTimeInSteps; i += 1) {
      this._shotsAtTime[i] = [];
    }

    this._currentStepTick = 0;

    return [...weaponNameSet];
  }
}

export default Game;
