import planck from 'planck';
import Factory from '../../lib/factory.js';
import constructors from '../parts/index.js';
import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';

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

    // данные игроков
    this._playersData = new Map();

    // активные пули
    this._shotsData = new Map();

    // id для пуль. (UINT16: до 65535 одновременных пуль)
    this._shotIdGen = new BinaryGenId(ID_FORMATS.UINT16);

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

    // созданные пули в момент времени (кольцевой буфер)
    this._shotsAtTime = new Array(this._maxShotTimeInSteps)
      .fill(null)
      .map(() => []);

    // хранение данных об удаленных пулях между updateData и getGameData
    this._lastExpiredShotsData = {};

    // хранение данных эффектов завершения оружия
    this._lastWeaponEffects = {};

    // хранение данных о новых выстрелах между отправками сети
    this._newShotsData = {};

    // набор орудий, из которых стреляли в текущем тике
    this._activeWeaponKeys = new Set();

    // кеш данных игроков для отправки (чтобы не вызывать getData дважды)
    this._cachedPlayersData = new Map();

    this.initNewShotsData();
  }

  // инициализация контейнеров для каждого оружия
  initNewShotsData() {
    this._newShotsData = {};

    for (const weaponName in this._weapons) {
      if (Object.hasOwn(this._weapons, weaponName)) {
        if (this._weapons[weaponName].type === 'hitscan') {
          this._newShotsData[weaponName] = [];
        } else {
          this._newShotsData[weaponName] = {};
        }
      }
    }
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
  createPlayer(gameId, model, teamId, respawnData) {
    const modelData = this._models[model];

    this._playersData.set(
      gameId,
      this._Factory(modelData.constructor, {
        world: this._world,
        playerKeys: this._playerKeys,
        model,
        gameId,
        teamId,
        currentWeapon: modelData.currentWeapon,
        weapons: this._weapons,
        services: this._services,
        modelData,
        position: [respawnData[0], respawnData[1]],
        angle: respawnData[2],
      }),
    );
  }

  // удаляет игрока
  removePlayer(gameId) {
    const player = this._playersData.get(gameId);

    if (player) {
      this._world.destroyBody(player.getBody());
      this._playersData.delete(gameId);
      this._cachedPlayersData.delete(gameId);
    }
  }

  // удаляет всех игроков и возвращает список удаленных моделей (игроков, дыма)
  _removePlayers() {
    const modelNameSet = new Set();

    for (const player of this._playersData.values()) {
      modelNameSet.add(player.model);
      this._world.destroyBody(player.getBody());
    }

    this._playersData.clear();
    this._cachedPlayersData.clear();

    return [...modelNameSet];
  }

  // обновляет нажатые клавиши
  updateKeys(gameId, keyData) {
    this._playersData.get(gameId)?.updateKeys(keyData);
  }

  // возвращает координаты игрока [x, y] или undefined
  getPosition(gameId) {
    return this._playersData.get(gameId)?.getPosition();
  }

  // возвращает данные игрока или undefined
  getPlayer(gameId) {
    return this._playersData.get(gameId);
  }

  // меняет данные игрока при переходе из одной команды в другую
  changePlayerData(gameId, data) {
    this._playersData.get(gameId)?.changePlayerData(data);
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

    this._playersData.clear();
    this._removeShots();
    this._lastExpiredShotsData = {};
    this._lastWeaponEffects = {};

    this._activeWeaponKeys.clear();

    this.initNewShotsData();

    this._cachedPlayersData.clear();
    this._accumulator = 0;
  }

  // обновляет данные физики
  updateData(dt) {
    // накапливание прошедшего времени
    this._accumulator += dt;

    // защита от "спирали смерти"
    // если накопилось слишком много времени (сильный лаг),
    // ограничение, чтобы не выполнять слишком много шагов физики за раз
    if (this._accumulator > this._maxAccumulatedTime) {
      this._accumulator = this._maxAccumulatedTime;
    }

    // делаем столько фиксированных шагов, сколько требуется
    while (this._accumulator >= this._timeStep) {
      // обновление логики игроков строго по фиксированному времени
      for (const player of this._playersData.values()) {
        player.updateData(this._timeStep);

        // получение данных (выстрелы)
        const shotData = player.getShotData();

        if (shotData) {
          const weaponName = player.currentWeapon;
          const weaponConfig = this._weapons[weaponName];
          const gameId = player.gameId;

          if (weaponConfig.type === 'hitscan') {
            const shot = this._hitscanService.processShot({
              ...shotData,
              gameId,
              weaponName,
            });

            this._newShotsData[weaponName].push(shot);
          } else if (weaponConfig.type === 'explosive') {
            const shot = this._createWeaponAction(gameId, weaponName, shotData);

            this._newShotsData[weaponName][shot.shotId] = shot.getData();
          }

          this._activeWeaponKeys.add(weaponName);
        }
      }

      // обработка исчезновения пуль по времени
      const expiredByTimeData = this._processShotsExpiredByTime();

      this._mergeShotOutcomeData(expiredByTimeData);

      // шаг физического мира
      this._world.step(
        this._timeStep,
        this._velocityIterations,
        this._positionIterations,
      );

      // обработка коллизий
      this._processContactEvents();

      // удаление тел
      this._destroyQueuedBodies();

      this._accumulator -= this._timeStep;
    }

    // обновление кеша состояния
    for (const player of this._playersData.values()) {
      this._cachedPlayersData.set(player.gameId, player.getData());
    }
  }

  // получение списка активных игроков
  getAlivePlayers() {
    const result = [];

    for (const player of this._playersData.values()) {
      if (player.isAlive()) {
        const pos = player.getPosition();

        result.push({
          gameId: player.gameId,
          teamId: player.teamId,
          x: pos[0],
          y: pos[1],
        });
      }
    }

    return result;
  }

  // проверка жив ли игрок
  isAlive(gameId) {
    const player = this._playersData.get(gameId);

    if (player && player.isAlive()) {
      return true;
    }

    return false;
  }

  //  применение урона игроку
  applyDamage(targetGameId, shooterGameId, weaponName, damageValue) {
    const player = this._playersData.get(targetGameId);

    // если игрок не существует или уже уничтожен, ничего не делаем
    if (this.isAlive(targetGameId) === false) {
      return;
    }

    const targetTeamId = player.teamId;
    const shooterTeamId = this._playersData.get(shooterGameId)?.teamId;

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
    if (weaponConfig.cameraShake) {
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
  _processContactEvents() {
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
  _destroyQueuedBodies() {
    if (this._bodiesToDestroy.size === 0) {
      return;
    }

    for (const body of this._bodiesToDestroy) {
      const userData = body.getUserData();

      // если это был снаряд, нужно обновить данные для клиентов
      if (userData && userData.type === 'shot') {
        this._shotsData.delete(userData.shotId);
        this._shotIdGen.release(userData.shotId);

        this._mergeShotOutcomeData({
          [userData.weaponName]: { [userData.shotId]: null },
        });
      }

      this._world.destroyBody(body);
    }

    this._bodiesToDestroy.clear();
  }

  // вспомогательный метод для слияния данных об исходе пуль
  _mergeShotOutcomeData(newData) {
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
  _processShotsExpiredByTime() {
    const shotsInCurrentTick = this._shotsAtTime[this._currentStepTick];
    const outcomeData = {};

    for (let i = 0, len = shotsInCurrentTick.length; i < len; i += 1) {
      const shotId = shotsInCurrentTick[i];
      const shot = this._shotsData.get(shotId);

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
        this._shotsData.delete(shotId);
        this._shotIdGen.release(shotId);

        // помечаем исходный снаряд (бомбу) как удаленный
        outcomeData[weaponName] = outcomeData[weaponName] || {};
        outcomeData[weaponName][shotId] = null;
      }
    }

    shotsInCurrentTick.length = 0; // очищаем текущий слот

    // переходим к следующему слоту
    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps;

    return outcomeData;
  }

  // возвращает события (выстрелы, взрывы, удаление пуль)
  getEvents() {
    const events = {};
    let hasEvents = false;

    // новые выстрелы
    for (const key of this._activeWeaponKeys) {
      const val = this._newShotsData[key];
      events[key] = val;
      hasEvents = true;

      // пустые контейнеры для следующего тика
      if (Array.isArray(val)) {
        this._newShotsData[key] = [];
      } else {
        this._newShotsData[key] = {};
      }
    }

    // очистка набора активных оружий для следующего тика
    this._activeWeaponKeys.clear();

    // исчезновение пуль
    if (Object.keys(this._lastExpiredShotsData).length > 0) {
      Object.assign(events, this._lastExpiredShotsData);
      this._lastExpiredShotsData = {};
      hasEvents = true;
    }

    // эффекты взрывов
    if (Object.keys(this._lastWeaponEffects).length > 0) {
      Object.assign(events, this._lastWeaponEffects);
      this._lastWeaponEffects = {};
      hasEvents = true;
    }

    return hasEvents ? events : null;
  }

  // возвращает текущее состояние мира (игроки)
  getWorldState() {
    const state = {};

    for (const player of this._playersData.values()) {
      const { model, gameId } = player;
      const playerData = this._cachedPlayersData.get(gameId);

      if (playerData) {
        state[model] = state[model] || {};
        state[model][gameId] = playerData;
      }
    }

    return state;
  }

  // возвращает полные данные всех игроков
  getPlayersData() {
    const gameData = {};

    for (const player of this._playersData.values()) {
      const { model, gameId } = player;

      gameData[model] = gameData[model] || {};
      gameData[model][gameId] = player.getData();
    }

    return gameData;
  }

  // создает действие с оружием и возвращает объект снаряда
  _createWeaponAction(gameId, weaponName, shotData) {
    const weaponData = this._weapons[weaponName];
    const lifetimeMs = weaponData.time;
    const lifetimeSeconds = lifetimeMs / 1000.0;
    let lifetimeInSteps = Math.ceil(lifetimeSeconds / this._timeStep);

    const player = this._playersData.get(gameId);

    if (lifetimeInSteps < 1) {
      lifetimeInSteps = 1;
    }

    if (lifetimeInSteps >= this._maxShotTimeInSteps) {
      lifetimeInSteps = this._maxShotTimeInSteps - 1;

      if (lifetimeInSteps < 0) {
        lifetimeInSteps = 0; // на случай если _maxShotTimeInSteps = 1
      }
    }

    // новый ID для пули
    const shotId = this._shotIdGen.next();

    // слот, в который будет помещена пуля для удаления
    const removalTick =
      (this._currentStepTick + lifetimeInSteps) % this._maxShotTimeInSteps;

    // создаем экземпляр снаряда (например, Bomb)
    const shot = this._Factory(weaponData.constructor, {
      weaponData,
      position: shotData.bodyPosition,
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

    this._shotsData.set(shotId, shot);
    this._shotsAtTime[removalTick].push(shotId);

    return shot;
  }

  // удаляет данные игроков и пуль и возвращает список удалённых имён
  removePlayersAndShots() {
    return [
      ...this._removePlayers(),
      ...this._removeShots(),
      ...Object.keys(this._hitscanWeapons),
      ...this._weaponEffectList,
    ];
  }

  // сбрасывает currentShotId,
  // удаляет все пули и возвращает список удаленных имён
  _removeShots() {
    const weaponNameSet = new Set();

    for (const shot of this._shotsData.values()) {
      weaponNameSet.add(shot.weaponName);
      this._world.destroyBody(shot.getBody());
    }

    this._shotsData.clear();
    this._shotIdGen.reset(); // сброс генератора

    // очистка кольцевого буфера
    for (let i = 0; i < this._maxShotTimeInSteps; i += 1) {
      this._shotsAtTime[i].length = 0;
    }

    this._currentStepTick = 0;

    return [...weaponNameSet];
  }
}

export default Game;
