import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';
import { randomRange } from '../../lib/math.js';

export default class WeaponManager {
  constructor(game, factory, world, weaponsConfig, friendlyFire) {
    this._game = game;
    this._Factory = factory;
    this._world = world;
    this._weapons = weaponsConfig;
    this._friendlyFire = friendlyFire;

    this._weaponList = Object.keys(this._weapons);

    // основное хранилище: gameID -> weaponName
    this._playerWeapons = new Map();

    // хранилище кулдаунов: gameID -> { [weaponName]: number }
    this._playerCooldowns = new Map();

    this._shotIdGen = new BinaryGenId(ID_FORMATS.UINT16);
    this._shotsData = new Map(); // хранилище активных физических пуль

    this._hitscanService = null; // будет создан, если передан конструктор

    // инициализация кольцевого буфера
    this._timeStep = 0;
    this._maxShotTimeInSteps = 1;
    this._currentStepTick = 0;
    this._shotsAtTime = [];

    // буферы
    this._newShotsData = {}; // новые выстрелы за тик
    this._activeWeaponKeys = new Set(); // набор оружия
    this._lastExpiredShotsData = {}; // пули, пропавшие сами или удаленные
    this._lastWeaponEffects = {}; // взрывы

    this._initContainers();
  }

  // инициализация зависимостей
  init(parts, timeStep) {
    this._timeStep = timeStep;

    // инит сервиса хитскана
    const hitscanWeapons = Object.fromEntries(
      Object.entries(this._weapons).filter(
        ([, weaponData]) => weaponData.type === 'hitscan',
      ),
    );

    this._hitscanService = this._Factory(parts.hitscanService, {
      world: this._world,
      weapons: hitscanWeapons,
      game: this._game,
    });

    // инит списка эффектов для полного удаления
    this._weaponEffectList = [
      ...new Set(
        Object.values(this._weapons)
          .filter(weapon => weapon.shotOutcomeId)
          .map(weapon => weapon.shotOutcomeId),
      ),
    ];

    // инит буфера времени
    this._setupTimeBuffer(timeStep);
  }

  // настройка кольцевого буфера
  _setupTimeBuffer(timeStep) {
    let maxLifetimeMs = 0;
    // поиск максимального времени жизни снаряда
    for (const name in this._weapons) {
      if (this._weapons[name].type !== 'hitscan') {
        const time = this._weapons[name].time || 0;

        if (time > maxLifetimeMs) {
          maxLifetimeMs = time;
        }
      }
    }

    const maxLifetimeWithBufferSeconds = (maxLifetimeMs / 1000.0) * 1.5;

    this._maxShotTimeInSteps = Math.ceil(
      maxLifetimeWithBufferSeconds / timeStep,
    );

    if (this._maxShotTimeInSteps < 1) {
      this._maxShotTimeInSteps = 1;
    }

    this._currentStepTick = 0;
    this._shotsAtTime = new Array(this._maxShotTimeInSteps)
      .fill(null)
      .map(() => []);
  }

  // инициализация структуры данных
  _initContainers() {
    this._newShotsData = {};

    for (const name in this._weapons) {
      if (this._weapons[name].type === 'hitscan') {
        this._newShotsData[name] = [];
      } else {
        this._newShotsData[name] = {};
      }
    }
  }

  // регистрирует игрока с начальным оружием
  registerPlayer(gameId, defaultWeapon) {
    if (!this._weapons[defaultWeapon]) {
      defaultWeapon = this._weaponList[0];
    }

    this._playerWeapons.set(gameId, defaultWeapon);

    // инициализация объекта кулдаунов для нового игрока
    // записи для всех видов оружия (0 - готово к стрельбе)
    const cooldowns = {};

    for (const key of this._weaponList) {
      cooldowns[key] = 0;
    }

    this._playerCooldowns.set(gameId, cooldowns);
  }

  // удаляет данные игрока
  unregisterPlayer(gameId) {
    this._playerWeapons.delete(gameId);
    this._playerCooldowns.delete(gameId);
  }

  // возвращает текущее оружие игрока и его параметры
  getWeapon(gameId) {
    const weaponName = this._playerWeapons.get(gameId);
    const weaponConfig = this.getWeaponConfig(weaponName);

    return [weaponName, weaponConfig];
  }

  // возвращает параметры оружия
  getWeaponConfig(weaponName) {
    return this._weapons[weaponName];
  }

  // меняет оружие на следующее/предыдущее
  switchWeapon(gameId, direction) {
    const currentWeapon = this._playerWeapons.get(gameId);

    if (!currentWeapon) {
      return;
    }

    let index = this._weaponList.indexOf(currentWeapon);

    if (index === -1) {
      index = 0;
    }

    index += direction;

    if (index < 0) {
      index = this._weaponList.length - 1;
    } else if (index >= this._weaponList.length) {
      index = 0;
    }

    const newWeapon = this._weaponList[index];

    this._playerWeapons.set(gameId, newWeapon);

    return newWeapon;
  }

  //  обработка выстрела
  fire(gameId, teamId, shotData) {
    const weaponName = this._playerWeapons.get(gameId);

    if (!weaponName || !shotData) {
      return;
    }

    const weaponConfig = this._weapons[weaponName];
    const cooldowns = this._playerCooldowns.get(gameId);

    // проверка кулдауна (fire rate)
    if (cooldowns && cooldowns[weaponName] > 0) {
      return;
    }

    // установка кулдауна
    // если fireRate нет или 0, то кулдаун 0 (стреляет каждый тик)
    if (cooldowns) {
      cooldowns[weaponName] = weaponConfig.fireRate || 0;
    }

    // применение разброса (spread)
    const direction = shotData.direction.clone();
    const spread = weaponConfig.spread || 0;

    if (spread > 0) {
      // генерация случайного угола от -spread/2 до +spread/2
      const angleOffset = randomRange(-spread, spread);

      // поворот вектора:
      // x' = x cos a - y sin a
      // y' = x sin a + y cos a
      const cosA = Math.cos(angleOffset);
      const sinA = Math.sin(angleOffset);

      const newX = direction.x * cosA - direction.y * sinA;
      const newY = direction.x * sinA + direction.y * cosA;

      direction.set(newX, newY);
    }

    const finalShotData = {
      ...shotData,
      direction,
    };

    if (weaponConfig.type === 'hitscan') {
      const shot = this._hitscanService.processShot({
        ...finalShotData,
        gameId,
        weaponName,
      });

      this._newShotsData[weaponName].push(shot);
    } else if (weaponConfig.type === 'explosive') {
      const shot = this._createProjectile(
        gameId,
        teamId,
        weaponName,
        weaponConfig,
        finalShotData,
      );

      this._newShotsData[weaponName][shot.shotId] = shot.getData();
    }

    this._activeWeaponKeys.add(weaponName);
  }

  // создание снаряда
  _createProjectile(gameId, teamId, weaponName, weaponConfig, shotData) {
    // расчет времени жизни в шагах физики (тиках)
    const lifetimeMs = weaponConfig.time; // время жизни в мс из конфига
    const lifetimeSeconds = lifetimeMs / 1000.0;

    // перевод секунд в количество обновлений (steps)
    let lifetimeInSteps = Math.ceil(lifetimeSeconds / this._timeStep);

    // снаряд живет минимум 1 такт
    if (lifetimeInSteps < 1) {
      lifetimeInSteps = 1;
    }

    // ограничение времени жизни кольцевого буфера
    // (защита от переполнения массива времени)
    if (lifetimeInSteps >= this._maxShotTimeInSteps) {
      lifetimeInSteps = this._maxShotTimeInSteps - 1;

      if (lifetimeInSteps < 0) {
        lifetimeInSteps = 0;
      }
    }

    const shotId = this._shotIdGen.next();

    // определение такта (тика), на котором снаряд должен исчезнуть
    const removalTick =
      (this._currentStepTick + lifetimeInSteps) % this._maxShotTimeInSteps;

    // создание экземпляра снаряда
    const shot = this._Factory(weaponConfig.constructor, {
      weaponData: weaponConfig,
      position: shotData.bodyPosition,
      world: this._world,
      userData: {
        type: weaponConfig.type,
        weaponName,
        shotId,
        gameId,
        teamId,
      },
    });

    // привязка метаданных к объекту
    shot.shotId = shotId;
    shot.weaponName = weaponName;

    // сохранение в структуры данных
    this._shotsData.set(shotId, shot);
    this._shotsAtTime[removalTick].push(shotId);

    return shot;
  }

  // обновление каждый тик игры
  update(dt) {
    // обработка исчезновения пуль по таймеру
    this._processShotsExpiredByTime();

    // обновление кулдаунов оружия
    for (const cooldowns of this._playerCooldowns.values()) {
      for (const weaponKey in cooldowns) {
        if (cooldowns[weaponKey] > 0) {
          cooldowns[weaponKey] -= dt;

          if (cooldowns[weaponKey] < 0) {
            cooldowns[weaponKey] = 0;
          }
        }
      }
    }
  }

  // проверка таймеров снарядов
  _processShotsExpiredByTime() {
    const shotsInCurrentTick = this._shotsAtTime[this._currentStepTick];

    for (let i = 0; i < shotsInCurrentTick.length; i += 1) {
      const shotId = shotsInCurrentTick[i];
      const shot = this._shotsData.get(shotId);

      // если пуля есть (не уничтожена о стену/игрока ранее)
      if (shot) {
        const weaponName = shot.weaponName;
        const weapon = this._weapons[weaponName];

        // взрыв по таймеру
        if (weapon.shotOutcomeId) {
          const explosionData = shot.detonate(
            this._world,
            this._game,
            this._friendlyFire,
          );

          this._registerEffect(weapon.shotOutcomeId, explosionData);
        }

        // физическое удаление
        this._world.destroyBody(shot.getBody());
        this._shotsData.delete(shotId);
        this._shotIdGen.release(shotId);

        // запись об удалении
        this._mergeShotOutcomeData({
          [weaponName]: { [shotId]: null },
        });
      }
    }

    // очистка слота и переход
    shotsInCurrentTick.length = 0;
    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps;
  }

  // удаление, когда пуля попадает в игрока (физическая коллизия)
  onShotContactDestruction(userData) {
    if (!userData || !userData.shotId) {
      return;
    }

    this._shotsData.delete(userData.shotId);
    this._shotIdGen.release(userData.shotId);

    this._mergeShotOutcomeData({
      [userData.weaponName]: { [userData.shotId]: null },
    });
  }

  // добавление эффектов (взрывов)
  _registerEffect(outcomeId, data) {
    this._lastWeaponEffects[outcomeId] =
      this._lastWeaponEffects[outcomeId] || [];
    this._lastWeaponEffects[outcomeId].push(data);
  }

  _mergeShotOutcomeData(newData) {
    for (const weaponName in newData) {
      this._lastExpiredShotsData[weaponName] =
        this._lastExpiredShotsData[weaponName] || {};
      Object.assign(
        this._lastExpiredShotsData[weaponName],
        newData[weaponName],
      );
    }
  }

  // сбор данных для отправки по сети
  getEvents() {
    const events = {};
    let hasEvents = false;

    // новые выстрелы
    for (const key of this._activeWeaponKeys) {
      events[key] = this._newShotsData[key];
      hasEvents = true;

      // сброс
      if (Array.isArray(events[key])) {
        this._newShotsData[key] = [];
      } else {
        this._newShotsData[key] = {};
      }
    }

    this._activeWeaponKeys.clear();

    // удаления / тайм-ауты
    if (Object.keys(this._lastExpiredShotsData).length > 0) {
      Object.assign(events, this._lastExpiredShotsData);
      this._lastExpiredShotsData = {};
      hasEvents = true;
    }

    // эффекты
    if (Object.keys(this._lastWeaponEffects).length > 0) {
      Object.assign(events, this._lastWeaponEffects);
      this._lastWeaponEffects = {};
      hasEvents = true;
    }

    return hasEvents ? events : null;
  }

  // полная очистка
  clear() {
    // удаление активных пуль
    for (const shot of this._shotsData.values()) {
      if (shot.getBody()) {
        this._world.destroyBody(shot.getBody());
      }
    }

    this._shotsData.clear();
    this._shotIdGen.reset();
    this._playerWeapons.clear();

    // очистка буферов
    for (let i = 0; i < this._maxShotTimeInSteps; i += 1) {
      this._shotsAtTime[i].length = 0;
    }

    this._currentStepTick = 0;
    this._lastExpiredShotsData = {};
    this._lastWeaponEffects = {};
    this._activeWeaponKeys.clear();
    this._initContainers();
  }

  // возвращает список названий эффектов оружия
  getWeaponEffectList() {
    return this._weaponEffectList;
  }
}
