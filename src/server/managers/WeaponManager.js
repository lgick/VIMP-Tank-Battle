import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';

export default class WeaponManager {
  constructor(game, factory, world, weaponsConfig, friendlyFire) {
    this._game = game;
    this._Factory = factory;
    this._world = world;
    this._weapons = weaponsConfig;
    this._friendlyFire = friendlyFire;

    this._weaponList = Object.keys(this._weapons);

    const effectSet = new Set();

    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const w = this._weapons[this._weaponList[i]];

      if (w.shotOutcomeId) {
        effectSet.add(w.shotOutcomeId);
      }
    }

    this._weaponEffectList = [...effectSet];

    this._playerWeapons = new Map();
    this._playerCooldowns = new Map(); // gameId -> { weaponName: number }

    this._shotIdGen = new BinaryGenId(ID_FORMATS.UINT16);
    this._shotsData = new Map();

    this._hitscanService = null;

    this._timeStep = 0;
    this._maxShotTimeInSteps = 1;
    this._currentStepTick = 0;
    this._shotsAtTime = [];

    this._shots = Object.create(null);
    this._expired = Object.create(null);
    this._effects = Object.create(null);

    this._initEventStorage();
  }

  // создает пустые массивы
  _initEventStorage() {
    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const name = this._weaponList[i];

      this._shots[name] = [];
      this._expired[name] = [];
    }

    for (let i = 0, len = this._weaponEffectList.length; i < len; i += 1) {
      this._effects[this._weaponEffectList[i]] = [];
    }
  }

  init(parts, timeStep) {
    this._timeStep = timeStep;

    // фильтрация hitscan оружия для сервиса
    const hitscanWeapons = {};

    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const key = this._weaponList[i];

      if (this._weapons[key].type === 'hitscan') {
        hitscanWeapons[key] = this._weapons[key];
      }
    }

    this._hitscanService = this._Factory(parts.hitscanService, {
      world: this._world,
      weapons: hitscanWeapons,
      game: this._game,
    });

    this._setupTimeBuffer(timeStep);
  }

  _setupTimeBuffer(timeStep) {
    let maxLifetimeMs = 0;

    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const w = this._weapons[this._weaponList[i]];

      // hitscan не имеет времени жизни в полете
      if (w.type !== 'hitscan' && w.time > maxLifetimeMs) {
        maxLifetimeMs = w.time;
      }
    }

    // буфер безопасности x1.5
    const maxLifetime = (maxLifetimeMs / 1000) * 1.5;

    this._maxShotTimeInSteps = Math.max(1, Math.ceil(maxLifetime / timeStep));

    // инициализация кольцевого массива
    this._shotsAtTime = new Array(this._maxShotTimeInSteps);

    for (let i = 0; i < this._maxShotTimeInSteps; i += 1) {
      this._shotsAtTime[i] = [];
    }
  }

  registerPlayer(gameId, defaultWeapon) {
    if (!this._weapons[defaultWeapon]) {
      defaultWeapon = this._weaponList[0];
    }

    this._playerWeapons.set(gameId, defaultWeapon);

    // объект кулдаунов с фиксированной формой
    const cd = {};

    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      cd[this._weaponList[i]] = 0;
    }

    this._playerCooldowns.set(gameId, cd);
  }

  unregisterPlayer(gameId) {
    this._playerWeapons.delete(gameId);
    this._playerCooldowns.delete(gameId);
  }

  getWeapon(gameId) {
    const weaponName = this._playerWeapons.get(gameId);

    return [weaponName, this._weapons[weaponName]];
  }

  getWeaponConfig(weaponName) {
    return this._weapons[weaponName];
  }

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

    const len = this._weaponList.length;

    if (index < 0) {
      index = len - 1;
    } else if (index >= len) {
      index = 0;
    }

    const newWeapon = this._weaponList[index];

    // если оружие не то же самое
    if (newWeapon !== currentWeapon) {
      this._playerWeapons.set(gameId, newWeapon);
    }

    return newWeapon;
  }

  fire(gameId, teamId, shotData) {
    const weaponName = this._playerWeapons.get(gameId);
    const weapon = this._weapons[weaponName];
    const cooldowns = this._playerCooldowns.get(gameId);

    // проверка кулдауна
    if (cooldowns && cooldowns[weaponName] > 0) {
      return false;
    }

    // установка кулдауна
    if (cooldowns) {
      cooldowns[weaponName] = weapon.fireRate || 0;
    }

    if (weapon.type === 'hitscan') {
      const shot = this._hitscanService.processShot(
        gameId,
        weaponName,
        shotData,
      );

      this._shots[weaponName].push(shot);
    } else {
      const shot = this._createProjectile(
        gameId,
        teamId,
        weaponName,
        weapon,
        shotData,
      );

      this._shots[weaponName].push(shot.getData());
    }

    return true;
  }

  _createProjectile(gameId, teamId, weaponName, weapon, shotData) {
    // оптимизация деления
    let steps = Math.ceil((weapon.time * 0.001) / this._timeStep);

    // clamp
    steps = Math.max(1, Math.min(steps, this._maxShotTimeInSteps - 1));

    const shotId = this._shotIdGen.next();
    const removalTick =
      (this._currentStepTick + steps) % this._maxShotTimeInSteps;

    const shot = this._Factory(weapon.constructor, {
      weaponData: weapon,
      position: shotData.position,
      world: this._world,
      userData: { type: weapon.type, weaponName, shotId, gameId, teamId },
    });

    shot.shotId = shotId;
    shot.weaponName = weaponName;

    this._shotsData.set(shotId, shot);
    this._shotsAtTime[removalTick].push(shotId);

    return shot;
  }

  update(dt) {
    this._processShotsExpiredByTime();

    // обновление кулдаунов
    for (const cooldowns of this._playerCooldowns.values()) {
      for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
        const key = this._weaponList[i];

        if (cooldowns[key] > 0) {
          cooldowns[key] -= dt;

          if (cooldowns[key] < 0) {
            cooldowns[key] = 0;
          }
        }
      }
    }
  }

  _processShotsExpiredByTime() {
    const list = this._shotsAtTime[this._currentStepTick];
    const len = list.length;

    // если список пуст, просто сдвигается тик
    if (len === 0) {
      this._currentStepTick =
        (this._currentStepTick + 1) % this._maxShotTimeInSteps;

      return;
    }

    for (let i = 0; i < len; i += 1) {
      const id = list[i];
      const shot = this._shotsData.get(id);

      // если пуля уже уничтожена (об стену/игрока), пропуск
      if (!shot) {
        continue;
      }

      const weaponName = shot.weaponName;
      const weapon = this._weapons[weaponName];

      // взрыв по таймеру
      if (weapon.shotOutcomeId) {
        const explosionData = shot.detonate(
          this._world,
          this._game,
          this._friendlyFire,
        );

        this._effects[weapon.shotOutcomeId].push(explosionData);
      }

      // удаление тела и данных
      this._world.destroyBody(shot.getBody());
      this._shotsData.delete(id);
      this._shotIdGen.release(id);

      // запись в массив удаленных
      this._expired[weaponName].push(id);
    }

    // очистка слота кольцевого буфера
    list.length = 0;

    this._currentStepTick =
      (this._currentStepTick + 1) % this._maxShotTimeInSteps;
  }

  onShotContactDestruction(userData) {
    const shotId = userData?.shotId;

    if (this._shotsData.has(shotId)) {
      this._shotsData.delete(shotId);
      this._shotIdGen.release(shotId);
      this._expired[userData.weaponName].push(shotId);
    }
  }

  // собирает объект событий только если они есть
  getEvents() {
    let hasEvents = false;
    const events = {};

    // новые выстрелы
    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const name = this._weaponList[i];
      const arr = this._shots[name];

      if (arr.length > 0) {
        events[name] = arr.slice();
        arr.length = 0;
        hasEvents = true;
      }
    }

    // удаленные пули
    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const name = this._weaponList[i];
      const arr = this._expired[name];

      if (arr.length > 0) {
        if (!events[name]) {
          events[name] = {};
        }

        const expObj = {};

        for (let k = 0; k < arr.length; k += 1) {
          expObj[arr[k]] = 0;
        }

        if (Array.isArray(events[name])) {
          const removalData = {};

          for (let k = 0; k < arr.length; k += 1) {
            removalData[arr[k]] = 0;
          }

          if (!events[name]) {
            events[name] = removalData;
            hasEvents = true;
          }

          arr.length = 0;
        }
      }

      // эффекты
      for (let i = 0, len = this._weaponEffectList.length; i < len; i += 1) {
        const id = this._weaponEffectList[i];
        const arr = this._effects[id];

        if (arr.length > 0) {
          events[id] = arr.slice();
          arr.length = 0;
          hasEvents = true;
        }
      }

      return hasEvents ? events : null;
    }
  }

  clear() {
    // удаление тел
    for (const shot of this._shotsData.values()) {
      if (shot.getBody()) {
        this._world.destroyBody(shot.getBody());
      }
    }

    this._shotsData.clear();
    this._shotIdGen.reset();
    this._playerWeapons.clear();

    // очистка тайм-буфера
    for (let i = 0; i < this._maxShotTimeInSteps; i += 1) {
      this._shotsAtTime[i].length = 0;
    }

    this._currentStepTick = 0;

    // очистка буферов событий
    for (let i = 0, len = this._weaponList.length; i < len; i += 1) {
      const name = this._weaponList[i];
      this._shots[name].length = 0;
      this._expired[name].length = 0;
    }

    for (let i = 0, len = this._weaponEffectList.length; i < len; i += 1) {
      this._effects[this._weaponEffectList[i]].length = 0;
    }
  }

  getWeaponEffectList() {
    return this._weaponEffectList;
  }
}
