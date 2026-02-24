import { weaponList, weaponConfig } from '../config/weapons.js';
import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';
import HitscanSystem from './systems/HitscanSystem.js';
import PhysicalSystem from './systems/PhysicalSystem.js';
import AoESystem from './systems/AoESystem.js';

export default class WeaponManager {
  constructor(game, world) {
    this._game = game;
    this._world = world;

    this._physicalSystem = new PhysicalSystem(world);
    this._aoeSystem = new AoESystem(world);
    this._hitscanSystem = new HitscanSystem(world);

    this._idGenerator = new BinaryGenId(ID_FORMATS.UINT16);
    this._playersState = new Map();

    // хранилище летящих снарядов
    this._activeProjectiles = [];

    // уничтоженные в текущем кадре физические объекты
    this._destroyedThisTick = [];

    // эффекты (хитсканы, взрывы, выстрелы)
    this._effects = [];

    // абсолютное время симуляции сервера (в секундах)
    this._currentTime = 0;
  }

  // возвращает список всех сущностей
  getAllEntities() {
    return Object.keys(weaponConfig);
  }

  // возвращает данные по оружию
  getWeaponConfig(weaponName) {
    return weaponConfig[weaponName];
  }

  // регистрирует нового игрока (при новом раунде)
  registerPlayer(gameId, ammo = {}) {
    const state = {
      activeIndex: 0, // индекс текущего выбранного оружия из weaponList
      ammo: {}, // текущий боезапас
      nextFireTime: {}, // метки абсолютного времени для стрельбы (кулдаун)
    };

    for (const weaponName of weaponList) {
      state.nextFireTime[weaponName] = 0;
      state.ammo[weaponName] = ammo[weaponName] ?? 0;
    }

    this._playersState.set(gameId, state);
  }

  // удаляет игрока
  unregisterPlayer(gameId) {
    this._playersState.delete(gameId);
  }

  // переключает оружие игрока вперед (direction = 1) или назад (direction = -1)
  switchWeapon(gameId, direction) {
    const state = this._playersState.get(gameId);
    let index = state.activeIndex + direction;

    if (index < 0) {
      index = weaponList.length - 1;
    }

    if (index >= weaponList.length) {
      index = 0;
    }

    state.activeIndex = index;

    return weaponList[index];
  }

  // обновляет менеджера (вызывается каждый шаг физики)
  update(dt) {
    this._currentTime += dt;

    // итерации по массиву с конца в начало,
    // чтобы при удалении элемента (splice или swap-pop)
    // индексы оставшихся необработанных элементов не сдвигались
    for (let i = this._activeProjectiles.length - 1; i >= 0; i -= 1) {
      const proj = this._activeProjectiles[i];

      // если время жизни вышло, детонация
      if (this._currentTime >= proj.detonationTime) {
        this._detonateProjectile(proj);
        this._removeProjectileAtIndex(i);
      }
    }
  }

  // обрабатывает выстрел
  fire(gameId, shotData) {
    const { ammo, nextFireTime, activeIndex } = this._playersState.get(gameId);
    const weaponName = weaponList[activeIndex];
    const config = weaponConfig[weaponName];

    // если время для выстрела ещё не пришло (кулдаун) или патронов нет
    if (this._currentTime < nextFireTime[weaponName] || ammo[weaponName] < 1) {
      return null;
    }

    // таймер для следующего выстрела
    nextFireTime[weaponName] = this._currentTime + config.fireRate;

    // списание патронов
    ammo[weaponName] -= 1;

    // TODO уточнить параметры
    // TODO это вызывать в методах оружия?
    if (config.type === 'hitscan') {
      this._processHitscan(gameId, shotData, config, weaponName);
    } else if (config.type === 'physical') {
      this._processPhysical(gameId, shotData, config, weaponName);
    }

    return { weaponName, count: ammo[weaponName] };
  }

  // удаляет элемент из массива за O(1) (паттерн swap and pop)
  _removeProjectileAtIndex(index) {
    const last = this._activeProjectiles.pop();

    // если удаляемый элемент не был последним, последний элемент на его место
    if (index < this._activeProjectiles.length) {
      this._activeProjectiles[index] = last;
    }
  }

  // обрабатывает лучевое оружие
  _processHitscan(gameId, shotData, config, weaponName) {
    const result = this._hitscanSystem.fire(shotData, config, gameId);

    // добавление эффекта хитскана
    this._effects.push({
      weapon: weaponName,
      startX: shotData.position.x,
      startY: shotData.position.y,
      endX: result.hit
        ? result.point.x
        : shotData.position.x + Math.cos(shotData.angle) * config.range,
      endY: result.hit
        ? result.point.y
        : shotData.position.y + Math.sin(shotData.angle) * config.range,
    });

    // если луч во что-то попал
    if (result.hit && result.targetId !== null) {
      this._game.applyDamage(
        result.targetId,
        gameId,
        weaponName,
        config.damage,
      );
    }
  }

  // обрабатывает физический снаряд
  _processPhysical(gameId, shotData, config, weaponName) {
    const shotId = this._idGenerator.next();
    const body = this._physicalSystem.spawn(
      // тело в движке planck.js
      shotData,
      config,
      gameId,
      weaponName,
    );
    const lifeTimeSeconds = config.time / 1000;

    // сохранение пули в активный массив,
    // чтобы update мог следить за ее временем жизни
    this._activeProjectiles.push({
      shotId,
      modelId: weaponName,
      body,
      size: config.size || 0,
      detonationTime: this._currentTime + lifeTimeSeconds,
      shooterId: gameId,
      nextWeapon: config.next,
    });
  }

  // взрывает физический снаряд
  _detonateProjectile(proj) {
    const pos = proj.body.getPosition();
    const nextConfig = weaponConfig[proj.nextWeapon];

    this._physicalSystem.despawn(proj.body); // удаление из физического мира
    this._idGenerator.release(proj.shotId); // освобождение id

    // запись в список уничтоженных для отправки
    this._destroyedThisTick.push({
      modelId: proj.modelId,
      shotId: proj.shotId,
    });

    if (!nextConfig) {
      return;
    }

    const { type, radius, damage } = nextConfig;

    // если эффект взрыва
    if (type === 'aoe') {
      this._effects.push({
        weapon: proj.nextWeapon,
        posX: pos.x,
        posY: pos.y,
        radius,
      });

      // поиск объектов в радиусе поражения
      const targets = this._aoeSystem.process(pos, nextConfig);

      for (const target of targets) {
        // урон падает линейно: чем дальше от эпицентра, тем меньше урон
        const damageMultiplier = 1 - target.distance / radius;
        const finalDamage = Math.max(1, Math.round(damage * damageMultiplier));

        this._game.applyDamage(
          target.id,
          proj.shooterId,
          proj.nextWeapon,
          finalDamage,
        );
      }
    }
  }

  // взрыв пули при столкновении
  // вызывается из Game.js (_processContactEvents) после шага физики
  explodeProjectileByBody(body) {
    for (let i = 0; i < this._activeProjectiles.length; i += 1) {
      const proj = this._activeProjectiles[i];

      if (proj.body === body) {
        this._detonateProjectile(proj);
        this._removeProjectileAtIndex(i);

        break;
      }
    }
  }

  // возвращает структурированные данные для запаковки в бинарный формат
  consumeData() {
    const activePhysicals = [];

    // сбор актуальных данных по всем летящим снарядам (каждый тик)
    for (let i = 0; i < this._activeProjectiles.length; i += 1) {
      const proj = this._activeProjectiles[i];
      const pos = proj.body.getPosition();

      activePhysicals.push({
        modelId: proj.modelId,
        shotId: proj.shotId,
        posX: pos.x,
        posY: pos.y,
        angle: proj.body.getAngle(),
        size: proj.size,
        time: Math.max(0, proj.detonationTime - this._currentTime),
      });
    }

    const result = {
      physical: activePhysicals, // активные физические объекты
      destroyed: this._destroyedThisTick, // уничтоженные в текущем кадре
      effects: this._effects, // эффекты (взрывы, лучи)
    };

    this._destroyedThisTick = [];
    this._effects = [];

    return result;
  }

  // полная очистка менеджера при завершении раунда или смене карты
  clear() {
    this._playersState.clear();
    this._destroyedThisTick = [];
    this._effects = [];

    for (const proj of this._activeProjectiles) {
      this._physicalSystem.despawn(proj.body);
    }

    this._activeProjectiles = [];
    this._currentTime = 0;
    this._idGenerator.reset();
  }
}
