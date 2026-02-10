import planck, { Vec2 } from 'planck';
import Factory from '../../lib/factory.js';
import constructors from '../parts/index.js';
import WeaponManager from '../managers/WeaponManager.js';
import { degToRad, roundTo2Decimals } from '../../lib/math.js';

// Singleton Game

let game;

class Game {
  constructor(userManager, parts, playerKeys, timeStep) {
    if (game) {
      return game;
    }

    game = this;

    this._Factory = Factory;
    this._Factory.add(constructors);

    this._userManager = userManager;
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

    this._playerKeys = { keys, oneShotMask };

    // хранилище состояния танков: gameId -> condition (10, 9, 8, .., 0)
    this._playerConditions = new Map();

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

    // инициализация менеджера оружия
    this._weaponManager = new WeaponManager(
      this,
      this._Factory,
      this._world,
      this._weapons,
      this._friendlyFire,
    );

    this._weaponManager.init(parts, this._timeStep);

    // список сущностей для очистки
    this._entitiesToClear = [
      ...Object.keys(this._models),
      ...Object.keys(this._weapons),
      ...this._weaponManager.getWeaponEffectList(),
    ];

    // данные игроков
    this._playersData = new Map();
  }

  // получает сервисы
  injectServices(services) {
    Object.assign(this._services, services);
  }

  // создает карту
  createMap(mapData) {
    this._map.createMap(mapData);
  }

  // сбрасывает динамические объекты карты
  resetDynamicMap() {
    this._map.resetDynamicMap();
  }

  // возвращает данные динамических элементов
  getDynamicMapData() {
    return this._map.getDynamicMapData();
  }

  // создает игрока
  createPlayer(gameId, model, teamId, respawnData) {
    const modelData = this._models[model];

    const body = this._world.createBody({
      type: 'dynamic',
      position: new Vec2(respawnData[0], respawnData[1]),
      angle: degToRad(respawnData[2]),
      angularDamping: modelData.damping.angular,
      linearDamping: modelData.damping.linear,
    });

    this._playersData.set(
      gameId,
      this._Factory(modelData.constructor, {
        gameId,
        model,
        teamId,
        body,
        playerKeys: this._playerKeys,
        modelData,
      }),
    );

    this._weaponManager.registerPlayer(gameId, modelData.currentWeapon);
    this._playerConditions.set(gameId, 10);
  }

  // удаляет игрока
  removePlayer(gameId) {
    const player = this._playersData.get(gameId);

    if (player) {
      this._world.destroyBody(player.getBody());
      this._playersData.delete(gameId);
      this._weaponManager.unregisterPlayer(gameId);
      this._playerConditions.delete(gameId);
    }
  }

  // обновляет нажатые клавиши
  updateKeys(gameId, keyData) {
    this._playersData.get(gameId).updateKeys(keyData);
  }

  // возвращает Vec2 координаты игрока
  getPosition(gameId) {
    return this._playersData.get(gameId).getPosition();
  }

  // возвращает координаты игрока или [0, 0] (если игрока нет)
  getPlayerCoordsOrZero(gameId) {
    const player = this._playersData.get(gameId);

    if (player) {
      const vec2Pos = player.getPosition();

      return [roundTo2Decimals(vec2Pos.x), roundTo2Decimals(vec2Pos.y)];
    }

    return [0, 0];
  }

  // возвращает данные игрока или undefined
  getPlayer(gameId) {
    return this._playersData.get(gameId);
  }

  // меняет данные игрока при переходе из одной команды в другую
  changePlayerData(gameId, data) {
    this._playersData.get(gameId).changePlayerData(data);
  }

  // обновляет данные физики
  updateData(dt) {
    this._accumulator += dt; // накапливание прошедшего времени

    // защита от "спирали смерти"
    // если накопилось слишком много времени (сильный лаг),
    // ограничение, чтобы не выполнять слишком много шагов физики за раз
    if (this._accumulator > this._maxAccumulatedTime) {
      this._accumulator = this._maxAccumulatedTime;
    }

    // делаем столько фиксированных шагов, сколько требуется
    while (this._accumulator >= this._timeStep) {
      this._weaponManager.update(this._timeStep); // обновление логики оружия

      // обновление логики игроков строго по фиксированному времени
      for (const player of this._playersData.values()) {
        const gameId = player.gameId;
        const panel = this._services.panel;

        player.updateData(this._timeStep);

        // статус смены оружия (1, -1 или 0)
        const weaponChangeStatus = player.consumeWeaponChangeStatus();

        // если команда на смену
        if (weaponChangeStatus !== 0) {
          const newWeapon = this._weaponManager.switchWeapon(
            gameId,
            weaponChangeStatus,
          );

          panel.setActiveWeapon(gameId, newWeapon);
        }

        // получение данных (выстрелы)
        const shotData = player.consumeShotData();

        if (shotData) {
          const [weaponName, weaponConfig] =
            this._weaponManager.getWeapon(gameId);
          const consumption = weaponConfig.consumption || 1;

          // проверка наличия патронов
          if (!panel.hasResources(gameId, weaponName, consumption)) {
            return;
          }

          // списание патронов
          panel.updateUser(gameId, weaponName, consumption, 'decrement');
          this._weaponManager.fire(gameId, player.teamId, shotData);
        }
      }

      // шаг физического мира
      this._world.step(
        this._timeStep,
        this._velocityIterations,
        this._positionIterations,
      );

      this._processContactEvents(); // обработка коллизий
      this._destroyQueuedBodies(); // удаление тел

      this._accumulator -= this._timeStep;
    }
  }

  //  применение урона игроку
  applyDamage(targetGameId, shooterGameId, weaponName, damageValue) {
    // если игрок не существует или уже уничтожен, ничего не делаем
    if (!this._userManager.isAlive(targetGameId)) {
      return;
    }

    const player = this._playersData.get(targetGameId);
    const targetTeamId = player.teamId;
    const shooterTeamId = this._playersData.get(shooterGameId).teamId;

    // проверка на дружественный огонь
    if (
      !this._friendlyFire &&
      shooterTeamId &&
      targetTeamId === shooterTeamId
    ) {
      return;
    }

    const weaponConfig = this._weaponManager.getWeaponConfig(weaponName);

    // если эффект тряски есть
    if (weaponConfig.cameraShake) {
      this._userManager.activateCameraShake(
        targetGameId,
        weaponConfig.cameraShake,
      );
    }

    // если урон не передан, берётся из конфига оружия
    const finalDamage =
      typeof damageValue === 'number' ? damageValue : weaponConfig.damage || 0;

    const currentHealth = this._services.panel.getCurrentValue(
      targetGameId,
      'health',
    );
    const newHealth = Math.max(0, currentHealth - finalDamage);
    const newCondition = Math.ceil(newHealth / 10);

    this._services.panel.updateUser(targetGameId, 'health', newHealth, 'set');
    this._playerConditions.set(targetGameId, newCondition);

    // обработка уничтожения
    if (newCondition === 0) {
      player.reset();

      // TODO
      // если игрок был уничтожен именно этим уроном, сообщаем VIMP
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

      if (shotData.type === 'explosive') {
        continue;
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
        this._weaponManager.onShotContactDestruction(userData);
      }

      this._world.destroyBody(body);
    }

    this._bodiesToDestroy.clear();
  }

  // возвращает события (выстрелы, взрывы, удаление пуль)
  getEvents() {
    return this._weaponManager.getEvents();
  }

  // возвращает текущее состояние мира (игроки)
  getWorldState() {
    const state = {};

    for (const player of this._playersData.values()) {
      const { model, gameId } = player;
      const playerData = [];

      if (playerData) {
        state[model] = state[model] || {};
        state[model][gameId] = playerData;
      }
    }

    return state;
  }

  // возвращает список имён моделей, оружия, эффектов оружия
  // для удаления на клиенте
  getEntitiesToClear() {
    return this._entitiesToClear;
  }

  // удаляет данные игроков и пуль (в начале раунда)
  removePlayersAndShots() {
    this._world.clearForces(); // сброс сил
    this._accumulator = 0;
    this._contactEvents = [];
    this._bodiesToDestroy.clear();
    this._playerConditions.clear();
    this._weaponManager.clear();

    for (const player of this._playersData.values()) {
      this._world.destroyBody(player.getBody());
    }

    this._playersData.clear();
  }

  // стирает данные игрового мира (при смене карты)
  clear() {
    this.removePlayersAndShots();
    this._map.clear();

    // удаления всех тел (если остались)
    let body = this._world.getBodyList();

    while (body) {
      const nextBody = body.getNext();

      this._world.destroyBody(body);
      body = nextBody;
    }
  }
}

export default Game;
