import planck from 'planck';
import Factory from '../../lib/factory.js';

// Singleton Game
let game;

class Game {
  constructor(parts, keys, timeStep) {
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

    this._services = {}; // объект для хранения внедренных сервисов

    this._friendlyFire = parts.friendlyFire;

    // список контактов для обработки после шага физики
    this._contactEvents = [];

    // очередь тел на удаление
    this._bodiesToDestroy = new Set();

    this._world = new planck.World({
      gravity: { x: 0, y: 0 },
      allowSleep: true,
    });

    this._world.on('begin-contact', contact => {
      // контакты, для обработки их после шага физики
      this._contactEvents.push({
        fixtureA: contact.getFixtureA(),
        fixtureB: contact.getFixtureB(),
      });
    });

    // конструктор карт
    this._map = this._Factory(parts.mapConstructor, this._world);

    this._hitscanWeapons = Object.fromEntries(
      Object.entries(this._weapons).filter(
        ([, weaponData]) => weaponData.type === 'hitscan',
      ),
    );

    // сервис вычисления hitscan выстрелов
    this._hitscanService = this._Factory(parts.hitscanService, {
      world: this._world,
      weapons: this._hitscanWeapons,
      game: this,
    });

    this._weaponEffectList = [
      ...new Set(
        Object.values(this._weapons)
          .filter(weapon => weapon.shotOutcomeID)
          .map(weapon => weapon.shotOutcomeID),
      ),
    ];

    // данные игроков { gameID: playerInstance }
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

    // не для hitscan оружия
    for (const weaponName in this._weapons) {
      if (
        Object.hasOwn(this._weapons, weaponName) &&
        this._weapons[weaponName].type !== 'hitscan'
      ) {
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

    for (let i = 0, len = this._maxShotTimeInSteps; i < len; i += 1) {
      this._shotsAtTime[i] = [];
    }

    // хранение данных об удаленных пулях между updateData и getGameData
    this._lastExpiredShotsData = {};

    // хранение данных эффектов завершения оружия
    this._lastWeaponEffects = {};
  }

  // получает сервисы
  injectServices(services) {
    Object.assign(this._services, services);
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
      weapons: this._weapons,
      services: this._services,
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
      if (Object.hasOwn(this._playersData, gameID)) {
        const player = this._playersData[gameID];

        modelNameSet.add(player.model);
        this._world.destroyBody(player.getBody());
      }
    }

    this._playersData = {};

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

  // возвращает объект игрока
  getPlayer(gameID) {
    return this._playersData[gameID];
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
    this._lastExpiredShotsData = {};
    this._accumulator = 0;
  }

  // обновляет данные физики
  updateData(dt) {
    // обновляем модели игроков
    for (const gameID in this._playersData) {
      if (Object.hasOwn(this._playersData, gameID)) {
        this._playersData[gameID].updateData(dt);
      }
    }

    // накапливаем прошедшее время
    this._accumulator += dt;

    // делаем столько фиксированных шагов, сколько нужно
    while (this._accumulator >= this._timeStep) {
      // оружие, чье время жизни истекло на этом шаге (не hitscan оружие)
      const expiredByTimeData = this.processShotsExpiredByTime();
      this.mergeShotOutcomeData(expiredByTimeData);

      this._world.step(
        this._timeStep,
        this._velocityIterations,
        this._positionIterations,
      );

      // обрабатываем все события контактов,
      // которые произошли на этом шаге
      this.processContactEvents();

      // удаляем все тела, которые были помечены на удаление
      this.destroyQueuedBodies();

      this._accumulator -= this._timeStep;
    }
  }

  //  применение урона игроку
  applyDamage(
    targetGameID,
    targetTeamID,
    weaponName,
    shooterTeamID,
    damageValue,
  ) {
    const player = this._playersData[targetGameID];

    // если игрок не существует или уже уничтожен, ничего не делаем
    if (!player || !player.isAlive()) {
      return;
    }

    // проверка на дружественный огонь
    if (!this._friendlyFire && targetTeamID === shooterTeamID) {
      return;
    }

    const weaponConfig = this._weapons[weaponName];

    // если эффект тряски есть
    if (weaponConfig?.cameraShake) {
      this._services.vimp.triggerCameraShake(
        targetGameID,
        weaponConfig.cameraShake,
      );
    }

    // если урон не передан, берётся из конфига оружия
    const damage =
      typeof damageValue === 'number' ? damageValue : weaponConfig?.damage || 0;

    player.takeDamage(damage);
  }

  // обрабатывает события контактов, накопленные за шаг физики
  processContactEvents() {
    for (const contact of this._contactEvents) {
      const fixtureA = contact.fixtureA;
      const fixtureB = contact.fixtureB;

      // проверка на случай, если фикстуры уже невалидны
      if (!fixtureA || !fixtureB) {
        continue;
      }

      const bodyA = fixtureA.getBody();
      const bodyB = fixtureB.getBody();

      const userDataA = bodyA.getUserData();
      const userDataB = bodyB.getUserData();

      if (!userDataA || !userDataB) {
        continue;
      }

      // логика определения кто в кого попал
      let playerFixture, shotFixture;

      if (userDataA.type === 'player' && userDataB.type === 'shot') {
        playerFixture = fixtureA;
        shotFixture = fixtureB;
      } else if (userDataB.type === 'player' && userDataA.type === 'shot') {
        playerFixture = fixtureB;
        shotFixture = fixtureA;
      } else {
        continue; // это не контакт между игроком и снарядом
      }

      const playerData = playerFixture.getBody().getUserData();
      const shotData = shotFixture.getBody().getUserData();

      // Если это оружие взрывного типа (например, бомба),
      // оно не должно уничтожаться при контакте, а только по таймеру.
      const weaponConfig = this._weapons[shotData.weaponName];
      if (weaponConfig && weaponConfig.type === 'explosive') {
        continue; // Игнорируем контакт и переходим к следующему
      }

      // если тело снаряда уже в очереди на удаление, пропускаем
      if (this._bodiesToDestroy.has(shotFixture.getBody())) {
        continue;
      }

      this.applyDamage(
        playerData.gameID,
        playerData.teamID,
        shotData.weaponName,
        shotData.teamID,
      );

      // помечаем снаряд на удаление, а не удаляем сразу
      this._bodiesToDestroy.add(shotFixture.getBody());
    }

    // очищаем массив для следующего шага
    this._contactEvents = [];
  }

  // уничтожает тела, находящиеся в очереди на удаление
  destroyQueuedBodies() {
    if (this._bodiesToDestroy.size === 0) {
      return;
    }

    for (const body of this._bodiesToDestroy) {
      const userData = body.getUserData();

      // если это был снаряд, нужно обновить данные для клиентов
      if (userData && userData.type === 'shot') {
        delete this._shotsData[userData.shotID];

        this.mergeShotOutcomeData({
          [userData.weaponName]: { [userData.shotID]: null },
        });
      }

      this._world.destroyBody(body);
    }

    this._bodiesToDestroy.clear();
  }

  // вспомогательный метод для слияния данных об исходе пуль
  mergeShotOutcomeData(newData) {
    for (const weaponName in newData) {
      if (Object.hasOwn(newData, weaponName)) {
        this._lastExpiredShotsData[weaponName] =
          this._lastExpiredShotsData[weaponName] || {};

        const data = newData[weaponName];

        for (const shotID in data) {
          if (Object.hasOwn(data, shotID)) {
            this._lastExpiredShotsData[weaponName][shotID] = data[shotID];
          }
        }
      }
    }
  }

  // обрабатывает оружие, чье время жизни истекло (не hitscan оружие)
  processShotsExpiredByTime() {
    const shotsInCurrentTick = this._shotsAtTime[this._currentStepTick];
    const outcomeData = {};

    for (let i = 0, len = shotsInCurrentTick.length; i < len; i += 1) {
      const shotID = shotsInCurrentTick[i];
      const shot = this._shotsData[shotID];

      // если пуля все еще существует (не была уничтожена досрочно)
      if (shot) {
        const weaponName = shot.weaponName;
        const weapon = this._weapons[weaponName];
        const shotOutcomeID = weapon.shotOutcomeID;

        // если у оружия есть эффект по истечению времени (например, взрыв)
        if (shotOutcomeID) {
          const explosionData = shot.detonate(
            this._world,
            this,
            this._friendlyFire,
          );

          this._lastWeaponEffects[shotOutcomeID] =
            this._lastWeaponEffects[shotOutcomeID] || [];
          this._lastWeaponEffects[shotOutcomeID].push(explosionData);
        }

        this._world.destroyBody(shot.getBody());
        delete this._shotsData[shotID];

        // помечаем исходный снаряд (бомбу) как удаленный
        outcomeData[weaponName] = outcomeData[weaponName] || {};
        outcomeData[weaponName][shotID] = null;
      }
    }

    this._shotsAtTime[this._currentStepTick] = []; // очищаем текущий слот
    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps; // переходим к следующему слоту

    return outcomeData;
  }

  // возвращает данные
  getGameData() {
    const gameData = {
      ...this._lastExpiredShotsData,
      ...this._lastWeaponEffects,
    };

    this._lastExpiredShotsData = {};
    this._lastWeaponEffects = {};

    for (const gameID in this._playersData) {
      if (Object.hasOwn(this._playersData, gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;
        const { playerData, shotData } = player.getData();

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = playerData;

        // если есть данные для создания пули (взрыва)
        if (shotData !== null) {
          const weaponName = player.currentWeapon;
          const weaponConfig = this._weapons[weaponName];

          if (weaponConfig.type === 'hitscan') {
            const hitscanParams = {
              shooterBody: shotData.shooterBody,
              shooterGameID: gameID,
              shooterTeamID: player.teamID,
              weaponName,
              startPoint: shotData.startPoint,
              direction: shotData.direction,
            };

            const shot = this._hitscanService.processShot(hitscanParams);

            gameData[weaponName] = gameData[weaponName] || [];
            gameData[weaponName].push(shot);
          } else if (weaponConfig.type === 'explosive') {
            const shot = this.createWeaponAction(gameID, weaponName, shotData);

            gameData[weaponName] = gameData[weaponName] || {};
            gameData[weaponName][shot.shotID] = shot.getData();
          }
        }
      }
    }

    return gameData;
  }

  // возвращает полные данные всех игроков
  getFullPlayersData() {
    const gameData = {};

    for (const gameID in this._playersData) {
      if (Object.hasOwn(this._playersData, gameID)) {
        const player = this._playersData[gameID];
        const model = player.model;

        gameData[model] = gameData[model] || {};
        gameData[model][gameID] = player.getFullData();
      }
    }

    return gameData;
  }

  // создает действие с оружием и возвращает объект снаряда
  createWeaponAction(gameID, weaponName, shotData) {
    const weaponData = this._weapons[weaponName];
    const lifetimeMs = weaponData.time;
    const lifetimeSeconds = lifetimeMs / 1000.0;
    let lifetimeInSteps = Math.ceil(lifetimeSeconds / this._timeStep);

    const player = this._playersData[gameID];

    if (lifetimeInSteps < 1) {
      lifetimeInSteps = 1;
    }

    if (lifetimeInSteps >= this._maxShotTimeInSteps) {
      lifetimeInSteps = this._maxShotTimeInSteps - 1;

      if (lifetimeInSteps < 0) {
        lifetimeInSteps = 0; // на случай если _maxShotTimeInSteps = 1
      }
    }

    this._currentShotID += 1;

    const shotID = this._currentShotID.toString(36);

    // слот, в который будет помещена пуля для удаления
    const removalTick =
      (this._currentStepTick + lifetimeInSteps) % this._maxShotTimeInSteps;

    // создаем экземпляр снаряда (например, Bomb)
    const shot = this._Factory(weaponData.constructor, {
      weaponData,
      shotData,
      userData: {
        type: 'shot',
        weaponName,
        shotID,
        gameID,
        teamID: player.teamID,
      },
      world: this._world,
    });

    shot.shotID = shotID;
    shot.weaponName = weaponName;

    this._shotsData[shotID] = shot;
    this._shotsAtTime[removalTick].push(shotID);

    return shot;
  }

  // удаляет данные игроков и пуль и возвращает список удалённых имён
  removePlayersAndShots() {
    return [
      ...this.removePlayers(),
      ...this.removeShots(),
      ...Object.keys(this._hitscanWeapons),
      ...this._weaponEffectList,
    ];
  }

  // сбрасывает currentShotID, удаляет все пули и возвращает список удаленных имён
  removeShots() {
    const weaponNameSet = new Set();

    this._currentShotID = 0;

    for (const shotID in this._shotsData) {
      if (Object.hasOwn(this._shotsData, shotID)) {
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
