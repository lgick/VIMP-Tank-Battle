import planck from 'planck';
import Factory from '../../lib/factory.js';
import constructors from '../parts/index.js';

// Singleton Game

let game;

class Game {
  constructor(parts, playerKeys, timeStep) {
    if (game) {
      return game;
    }

    game = this;

    this._Factory = Factory;
    this._Factory.add(constructors);

    this._models = parts.models;
    this._weapons = parts.weapons;

    const keys = {};
    let oneShotMask = 0;

    for (const name in playerKeys) {
      if (Object.hasOwn(playerKeys, name)) {
        const keyConfig = playerKeys[name];

        keys[name] = keyConfig.key;

        if (keyConfig.type === 1) {
          oneShotMask |= keyConfig.key;
        }
      }
    }

    this._playerKeys = {
      keys,
      oneShotMask,
    };

    // интервал фиксированного шага физики (в секундах, например 1 / 120)
    this._timeStep = timeStep;
    this._velocityIterations = 10;
    this._positionIterations = 8;
    this._accumulator = 0;
    this._maxAccumulatedTime = 0.1;

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
          .filter(weapon => weapon.shotOutcomeId)
          .map(weapon => weapon.shotOutcomeId),
      ),
    ];

    // данные игроков { gameId: playerInstance }
    this._playersData = {};

    // общий список активных пуль { shotId: shotObject }
    this._shotsData = {};

    // созданные пули в момент времени (кольцевой буфер)
    // { stepTick: [shotId1, shotId2] }
    this._shotsAtTime = {};

    // id для пуль
    this._currentShotId = 0;

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
  createPlayer(gameId, model, name, teamId, data) {
    const modelData = this._models[model];

    this._playersData[gameId] = this._Factory(modelData.constructor, {
      world: this._world,
      playerKeys: this._playerKeys,
      model,
      name,
      gameId,
      teamId,
      currentWeapon: modelData.currentWeapon,
      weapons: this._weapons,
      services: this._services,
      modelData,
      position: [data[0], data[1]],
      angle: data[2],
    });
  }

  // удаляет игрока
  removePlayer(gameId) {
    // если игрок существует
    if (this._playersData[gameId]) {
      this._world.destroyBody(this._playersData[gameId].getBody());
      delete this._playersData[gameId];
    }
  }

  // удаляет всех игроков и возвращает список удаленных моделей (игроков, дыма)
  removePlayers() {
    const modelNameSet = new Set();

    for (const gameId in this._playersData) {
      if (Object.hasOwn(this._playersData, gameId)) {
        const player = this._playersData[gameId];

        modelNameSet.add(player.model);
        this._world.destroyBody(player.getBody());
      }
    }

    this._playersData = {};

    return [...modelNameSet];
  }

  // меняет имя игрока
  changeName(gameId, name) {
    if (this._playersData[gameId]) {
      this._playersData[gameId].changeName(name);
    }
  }

  // обновляет нажатые клавиши
  updateKeys(gameId, keyData) {
    this._playersData[gameId].updateKeys(keyData);
  }

  // возвращает координаты игрока [x, y, angle]
  getPosition(gameId) {
    return this._playersData[gameId].getPosition();
  }

  // меняет данные игрока при переходе из одной команды в другую
  changePlayerData(gameId, data) {
    this._playersData[gameId].changePlayerData(data);
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
    for (const gameId in this._playersData) {
      if (Object.hasOwn(this._playersData, gameId)) {
        this._playersData[gameId].updateData(dt);
      }
    }

    // накапливаем прошедшее время
    this._accumulator += dt;

    // защита от "спирали смерти":
    // если накопилось слишком много времени (сильный лаг),
    // ограничение, чтобы не выполнять слишком много шагов физики за раз
    if (this._accumulator > this._maxAccumulatedTime) {
      this._accumulator = this._maxAccumulatedTime;
    }

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

  // проверка жив ли игрок
  isAlive(gameId) {
    const player = this._playersData[gameId];

    if (player && player.isAlive()) {
      return true;
    }

    return false;
  }

  //  применение урона игроку
  applyDamage(targetGameId, shooterGameId, weaponName, damageValue) {
    const player = this._playersData[targetGameId];

    // если игрок не существует или уже уничтожен, ничего не делаем
    if (this.isAlive(targetGameId) === false) {
      return;
    }

    const targetTeamId = player.teamId;
    const shooterTeamId = this._playersData[shooterGameId]?.teamId;

    // проверка на дружественный огонь
    if (
      !this._friendlyFire &&
      shooterTeamId &&
      targetTeamId === shooterTeamId
    ) {
      return;
    }

    const weaponConfig = this._weapons[weaponName];

    // если эффект тряски есть
    if (weaponConfig?.cameraShake) {
      this._services.vimp.triggerCameraShake(
        targetGameId,
        weaponConfig.cameraShake,
      );
    }

    // если урон не передан, берётся из конфига оружия
    const damage =
      typeof damageValue === 'number' ? damageValue : weaponConfig?.damage || 0;

    const wasDestroyed = player.takeDamage(damage);

    // если игрок был уничтожен именно этим уроном, сообщаем VIMP
    if (wasDestroyed) {
      this._services.vimp.reportKill(targetGameId, shooterGameId);
    }
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

      this.applyDamage(playerData.gameId, shotData.gameId, shotData.weaponName);

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
        delete this._shotsData[userData.shotId];

        this.mergeShotOutcomeData({
          [userData.weaponName]: { [userData.shotId]: null },
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

        for (const shotId in data) {
          if (Object.hasOwn(data, shotId)) {
            this._lastExpiredShotsData[weaponName][shotId] = data[shotId];
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
      const shotId = shotsInCurrentTick[i];
      const shot = this._shotsData[shotId];

      // если пуля все еще существует (не была уничтожена досрочно)
      if (shot) {
        const weaponName = shot.weaponName;
        const weapon = this._weapons[weaponName];
        const shotOutcomeId = weapon.shotOutcomeId;

        // если у оружия есть эффект по истечению времени (например, взрыв)
        if (shotOutcomeId) {
          const explosionData = shot.detonate(
            this._world,
            this,
            this._friendlyFire,
          );

          this._lastWeaponEffects[shotOutcomeId] =
            this._lastWeaponEffects[shotOutcomeId] || [];
          this._lastWeaponEffects[shotOutcomeId].push(explosionData);
        }

        this._world.destroyBody(shot.getBody());
        delete this._shotsData[shotId];

        // помечаем исходный снаряд (бомбу) как удаленный
        outcomeData[weaponName] = outcomeData[weaponName] || {};
        outcomeData[weaponName][shotId] = null;
      }
    }

    this._shotsAtTime[this._currentStepTick] = []; // очищаем текущий слот
    // переходим к следующему слоту
    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps;

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

    for (const gameId in this._playersData) {
      if (Object.hasOwn(this._playersData, gameId)) {
        const player = this._playersData[gameId];
        const model = player.model;
        const { playerData, shotData } = player.getData();

        gameData[model] = gameData[model] || {};
        gameData[model][gameId] = playerData;

        // если есть данные для создания пули (взрыва)
        if (shotData !== null) {
          const weaponName = player.currentWeapon;
          const weaponConfig = this._weapons[weaponName];

          if (weaponConfig.type === 'hitscan') {
            const shot = this._hitscanService.processShot({
              ...shotData,
              gameId,
              weaponName,
            });

            gameData[weaponName] = gameData[weaponName] || [];
            gameData[weaponName].push(shot);
          } else if (weaponConfig.type === 'explosive') {
            const shot = this.createWeaponAction(gameId, weaponName, shotData);

            gameData[weaponName] = gameData[weaponName] || {};
            gameData[weaponName][shot.shotId] = shot.getData();
          }
        }
      }
    }

    return gameData;
  }

  // возвращает полные данные всех игроков
  getFullPlayersData() {
    const gameData = {};

    for (const gameId in this._playersData) {
      if (Object.hasOwn(this._playersData, gameId)) {
        const player = this._playersData[gameId];
        const model = player.model;

        gameData[model] = gameData[model] || {};
        gameData[model][gameId] = player.getFullData();
      }
    }

    return gameData;
  }

  // создает действие с оружием и возвращает объект снаряда
  createWeaponAction(gameId, weaponName, shotData) {
    const weaponData = this._weapons[weaponName];
    const lifetimeMs = weaponData.time;
    const lifetimeSeconds = lifetimeMs / 1000.0;
    let lifetimeInSteps = Math.ceil(lifetimeSeconds / this._timeStep);

    const player = this._playersData[gameId];

    if (lifetimeInSteps < 1) {
      lifetimeInSteps = 1;
    }

    if (lifetimeInSteps >= this._maxShotTimeInSteps) {
      lifetimeInSteps = this._maxShotTimeInSteps - 1;

      if (lifetimeInSteps < 0) {
        lifetimeInSteps = 0; // на случай если _maxShotTimeInSteps = 1
      }
    }

    this._currentShotId += 1;

    const shotId = this._currentShotId.toString(36);

    // слот, в который будет помещена пуля для удаления
    const removalTick =
      (this._currentStepTick + lifetimeInSteps) % this._maxShotTimeInSteps;

    // создаем экземпляр снаряда (например, Bomb)
    const shot = this._Factory(weaponData.constructor, {
      weaponData,
      shotData,
      userData: {
        type: weaponData.type,
        weaponName,
        shotId,
        gameId,
        teamId: player.teamId,
      },
      world: this._world,
    });

    shot.shotId = shotId;
    shot.weaponName = weaponName;

    this._shotsData[shotId] = shot;
    this._shotsAtTime[removalTick].push(shotId);

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

  // сбрасывает currentShotId,
  // удаляет все пули и возвращает список удаленных имён
  removeShots() {
    const weaponNameSet = new Set();

    this._currentShotId = 0;

    for (const shotId in this._shotsData) {
      if (Object.hasOwn(this._shotsData, shotId)) {
        const shot = this._shotsData[shotId];

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
