import { weaponList, ammo, weaponConfig } from '../config/weapons.js';
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

    // хранилище физических снарядов
    this._physicals = [];
    this._physicalBodyToIndex = new Map();

    // уничтоженные в текущем кадре физические объекты
    this._destroyedThisTick = [];

    // очередь на детонацию
    this._detonationQueue = [];
    this._detonationLocked = false;

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
  registerPlayer(gameId) {
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

    if (!state) {
      return null;
    }

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

    this._detonationLocked = true;

    // итерации по массиву с конца в начало,
    // чтобы при удалении элемента (splice или swap-pop)
    // индексы оставшихся необработанных элементов не сдвигались
    for (let i = this._physicals.length - 1; i >= 0; i -= 1) {
      const proj = this._physicals[i];

      // если время жизни вышло
      if (this._currentTime >= proj.detonationTime) {
        this._removePhysicalAtIndex(i);
        this._detonationQueue.push(proj);
      }
    }

    this._detonationLocked = false;
    this._resolveDetonations();
  }

  // обрабатывает выстрел
  fire(gameId, shotData) {
    const state = this._playersState.get(gameId);

    if (!state) {
      return null;
    }

    const { ammo, nextFireTime, activeIndex } = state;
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

    if (config.type === 'hitscan') {
      this._processHitscan(gameId, shotData, config, weaponName);
    } else if (config.type === 'physical') {
      this._processPhysical(gameId, shotData, config, weaponName);
    }

    return { weaponName, count: ammo[weaponName] };
  }

  // удаляет физический объект
  _removePhysicalAtIndex(index) {
    const lastIndex = this._physicals.length - 1;
    const last = this._physicals[lastIndex];

    const removed = this._physicals[index];

    this._physicalBodyToIndex.delete(removed.body);

    this._physicals.pop();

    if (index < lastIndex) {
      this._physicals[index] = last;
      this._physicalBodyToIndex.set(last.body, index);
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
    const index = this._physicals.length;
    const body = this._physicalSystem.spawn(
      shotData,
      config,
      gameId,
      weaponName,
    );

    // сохранение пули
    this._physicals.push({
      shotId,
      modelId: weaponName,
      body,
      size: config.size || 0,
      shooterId: gameId,
      nextWeapon: config.next,
      detonationTime: config.time
        ? this._currentTime + config.time / 1000
        : Infinity,
    });

    this._physicalBodyToIndex.set(body, index);
  }

  // взрывает физический снаряд
  _detonatePhysical(proj) {
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
      const [players, projectiles] = this._aoeSystem.process(pos, nextConfig);

      // урон игрокам
      for (const player of players) {
        const finalDamage = Math.max(1, Math.round(damage * player.falloff));

        this._game.applyDamage(
          player.id,
          proj.shooterId,
          proj.nextWeapon,
          finalDamage,
        );
      }

      // детонация снарядов (цепная реакция)
      for (const shot of projectiles) {
        const shotConfig = weaponConfig[shot.weaponName];

        // если разрешено взрываться при контакте
        if (shotConfig.detonateOnImpact) {
          this.explodePhysicalByBody(shot.body);
        }
      }
    }
  }

  // запускает цикл детонаций
  _resolveDetonations() {
    // если есть блокировка детонаций
    if (this._detonationLocked) {
      return;
    }

    this._detonationLocked = true;

    while (this._detonationQueue.length > 0) {
      this._detonatePhysical(this._detonationQueue.pop());
    }

    this._detonationLocked = false;
  }

  // инициирует взрыв физического снаряда при физическом контакте
  explodePhysicalByBody(body) {
    const index = this._physicalBodyToIndex.get(body);

    if (index === undefined) {
      return;
    }

    const proj = this._physicals[index];

    this._removePhysicalAtIndex(index);
    this._detonationQueue.push(proj);
    this._resolveDetonations();
  }

  // возвращает структурированные данные для запаковки в бинарный формат
  consumeData() {
    const activePhysicals = [];

    // сбор актуальных данных по всем летящим снарядам (каждый тик)
    for (let i = 0; i < this._physicals.length; i += 1) {
      const proj = this._physicals[i];
      const pos = proj.body.getPosition();

      activePhysicals.push({
        modelId: proj.modelId,
        shotId: proj.shotId,
        posX: pos.x,
        posY: pos.y,
        angle: proj.body.getAngle(),
        size: proj.size,
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

    for (const proj of this._physicals) {
      this._physicalSystem.despawn(proj.body);
    }

    this._physicals = [];
    this._physicalBodyToIndex.clear();
    this._currentTime = 0;
    this._idGenerator.reset();
  }
}
