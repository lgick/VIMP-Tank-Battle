import { randomRange } from '../lib/math.js';
import { rayVsGrid, rayVsBox } from '../lib/raycast.js';
import { Vec2, rotateVec } from '../lib/vec2.js';

// Клиентский визуальный спавн снарядов своего танка (Фаза 5c): при нажатии
// fire трассер (w1) и бомба (w2) появляются немедленно, не дожидаясь
// подтверждения сервером (delay + RTT). Физика/урон/взрыв (w2e) — серверные.
//
// Поток: tryFire() реплицирует серверный гейт (кулдаун/патроны, формулы
// muzzle/direction из Tank.getMuzzlePosition/getFireDirection) и возвращает
// данные в формате снапшота для обычного CTRL-конвейера; конечная точка
// трассера — приближённый raycast по стенам карты, динамике и танкам.
// filterServerSnapshot() подавляет серверные дубли своих выстрелов
// (сервер помечает события id автора: tracers[7], bombs[5]).

const FORWARD = new Vec2(1, 0);

// максимальный возраст неподтверждённого локального выстрела (мс);
// старше — сервер выстрел отклонил, запись не должна съедать чужие дубли
const PENDING_MAX_AGE = 2000;

// максимальный возраст алиаса своей бомбы (мс). Штатно алиас снимается
// null'ом детонации; этот срок — только страховка от утечки, если null
// потерялся, поэтому он с запасом больше любого разумного weapon.time
const BOMB_ALIAS_MAX_AGE = 60000;

export default class ShotPredictor {
  /**
   * @param {Object} options
   * @param {Object} options.models - Конфиги моделей танков (models.js).
   * @param {Object} options.weapons - Конфиги оружия (weapons.js).
   * @param {import('./MapDynamics.js').default} [options.mapDynamics] -
   *   Общий реестр динамики карты (единый источник геометрии с TankPredictor).
   */
  constructor({ models, weapons, mapDynamics }) {
    this._models = models;
    this._weapons = weapons;
    this._weaponList = Object.keys(weapons);
    this._mapDynamics = mapDynamics || null;

    this._modelData = null; // выбирается setModel при авторизации
    this._currentWeapon = null;

    // локальные кулдауны: имя оружия → localTime готовности
    this._cooldownUntil = {};

    // патроны из панели: имя оружия → количество (undefined = неизвестно)
    this._ammo = {};

    // мир для raycast трассера (динамика карты — в this._mapDynamics)
    this._grid = null; // { map, solidTiles, tileSize }
    this._tanks = {}; // gameId → { x, y, angle, size }

    // неподтверждённые локальные выстрелы
    this._pendingTracers = []; // [{ time, weaponName }]
    this._pendingBombs = []; // [{ time, weaponName, localId }]
    this._expiredLocalBombs = []; // [{ localId, weaponName }] — истёкшие без подтверждения
    this._localBombSeq = 0;

    // подтверждённые свои бомбы: серверный id → { localId, time }.
    // Карта общая на все виды оружия: ключи глобально уникальны, потому что
    // shotId на сервере — сквозной счётчик (Game._currentShotId).
    // Сущность на полотне живёт под локальным id от спавна до детонации —
    // иначе её пришлось бы удалить и создать заново, что рвёт одноразовый
    // звук и перезапускает таймер
    this._bombAliases = {};
  }

  // модель танка пользователя (известна при авторизации)
  setModel(modelName) {
    this._modelData = this._models[modelName] || null;
    this._currentWeapon = this._modelData?.currentWeapon ?? null;
  }

  // данные карты (MAP_DATA): сетка стен для raycast трассера; динамика карты —
  // отдельно в MapDynamics (общий источник с TankPredictor, setMap там же)
  setMap({ map, step, scale, physicsStatic }) {
    this._grid = {
      map,
      solidTiles: physicsStatic || [],
      tileSize: step * scale,
    };

    this.reset();
  }

  // обновляет позиции танков-целей raycast из игровых данных (дискретный
  // кадр или интерполированный сэмпл); динамику карты обновляет MapDynamics
  updateWorld(game) {
    if (!game) {
      return;
    }

    for (const key in game) {
      if (!Object.hasOwn(game, key)) {
        continue;
      }

      // танки: [x, y, angle, gun, vx, vy, engineLoad, condition, size, teamId]
      if (this._models[key]) {
        const tanks = game[key];

        for (const id in tanks) {
          if (Object.hasOwn(tanks, id)) {
            const data = tanks[id];

            if (data === null) {
              delete this._tanks[id];
            } else {
              this._tanks[id] = {
                x: data[0],
                y: data[1],
                angle: data[2],
                size: data[8],
              };
            }
          }
        }
      }
    }
  }

  // синхронизация с панелью (порт PANEL_DATA): патроны и активное оружие
  syncPanel(arr) {
    if (!Array.isArray(arr)) {
      return;
    }

    for (const item of arr) {
      const [code, value] = String(item).split(':');

      if (code === 'wa') {
        if (this._weapons[value]) {
          this._currentWeapon = value;
        }
      } else if (this._weapons[code]) {
        this._ammo[code] = value === undefined ? undefined : Number(value);
      }
    }
  }

  // локальная реплика смены оружия (BaseModel.turnUserWeapon);
  // авторитетное подтверждение придёт панелью ('wa')
  cycleWeapon(back) {
    if (this._currentWeapon === null) {
      return;
    }

    let key = this._weaponList.indexOf(this._currentWeapon);

    key += back ? -1 : 1;

    if (key < 0) {
      key = this._weaponList.length - 1;
    } else if (key >= this._weaponList.length) {
      key = 0;
    }

    this._currentWeapon = this._weaponList[key];
  }

  /**
   * Локальный выстрел: гейт (кулдаун/патроны) + данные для рендера.
   * @param {Object} renderState - Предсказанное состояние танка
   *   (TankPredictor.getRenderState()).
   * @param {number|string} myGameId - Свой gameId.
   * @param {number} localNow - performance.now().
   * @returns {Object|null} Данные в формате снапшота ({ w1: [...] } или
   *   { w2: {...} }) для applyGameData, либо null (гейт не пройден).
   */
  tryFire(renderState, myGameId, localNow) {
    const weaponName = this._currentWeapon;
    const weapon = this._weapons[weaponName];

    if (!weapon || !this._modelData || !renderState || myGameId === null) {
      return null;
    }

    // кулдаун (fireRate в секундах)
    if (localNow < (this._cooldownUntil[weaponName] || 0)) {
      return null;
    }

    // патроны: неизвестное количество не блокирует (сервер авторитетен)
    const consumption = weapon.consumption || 1;
    const ammo = this._ammo[weaponName];

    if (ammo !== undefined && ammo < consumption) {
      return null;
    }

    if (ammo !== undefined) {
      this._ammo[weaponName] = ammo - consumption;
    }

    this._cooldownUntil[weaponName] = localNow + weapon.fireRate * 1000;

    const shooterId = Number(myGameId);

    if (weapon.type === 'hitscan') {
      const tracer = this._buildTracer(weapon, renderState, shooterId);

      this._pendingTracers.push({ time: localNow, weaponName });

      return { [weaponName]: [tracer] };
    }

    if (weapon.type === 'explosive') {
      // следующий выстрел — только после подтверждения предыдущего сервером
      if (this._pendingBombs.some(p => p.weaponName === weaponName)) {
        return null;
      }

      this._localBombSeq += 1;

      // 'L' не встречается в base36-ключах сервера (строчные символы)
      const localId = `L${this._localBombSeq}`;

      this._pendingBombs.push({ time: localNow, weaponName, localId });

      // бомба спавнится ровно там, где предсказан танк: RTT-компенсации нет,
      // потому что клиент не знает своей задержки (interpolator.offset — это
      // разница часов Date.now/performance.now, а не латентность)
      return {
        [weaponName]: {
          [localId]: [
            renderState.x,
            renderState.y,
            0,
            weapon.size,
            weapon.time,
            shooterId,
          ],
        },
      };
    }

    return null;
  }

  /**
   * Подавляет серверные дубли своих выстрелов в дискретном кадре снапшота.
   * @param {Object} game - Игровые данные кадра.
   * @param {number|string|null} myGameId - Свой gameId.
   * @param {number} localNow - performance.now().
   * @returns {Object} Данные с вычищенными дублями (исходные не мутируются).
   */
  filterServerSnapshot(game, myGameId, localNow) {
    if (!game) {
      return game;
    }

    this._trimPending(localNow);

    const myId = myGameId === null ? null : Number(myGameId);
    let result = game;

    // копия верхнего уровня делается лениво — только если что-то подавили
    const ensureCopy = () => {
      if (result === game) {
        result = { ...game };
      }
    };

    // инъекция null для бомб, чьи pending истекли без серверного подтверждения
    if (this._expiredLocalBombs.length > 0) {
      for (const { localId, weaponName: wn } of this._expiredLocalBombs) {
        ensureCopy();
        result[wn] = result[wn] ? { ...result[wn], [localId]: null } : { [localId]: null };
      }
      this._expiredLocalBombs = [];
    }

    for (const weaponName in this._weapons) {
      if (!Object.hasOwn(game, weaponName)) {
        continue;
      }

      const type = this._weapons[weaponName].type;

      // трассеры: свой дубль гасит самую старую pending-запись (FIFO)
      if (type === 'hitscan' && Array.isArray(game[weaponName]) && myId !== null) {
        const source = game[weaponName];
        const filtered = source.filter(tracer => {
          const index = this._pendingTracers.findIndex(
            p => p.weaponName === weaponName,
          );

          if (tracer[7] === myId && index !== -1) {
            this._pendingTracers.splice(index, 1);

            return false;
          }

          return true;
        });

        if (filtered.length !== source.length) {
          ensureCopy();

          // блок опустел (весь залп кадра оказался своим) — не тащим пустышку
          // в кадр: applyGameData иначе зовёт parse по каждому полотну впустую
          if (filtered.length === 0) {
            delete result[weaponName];
          } else {
            result[weaponName] = filtered;
          }
        }
      }

      // бомбы: своя сущность живёт под локальным L<n> от спавна до детонации,
      // серверные строки переезжают под этот ключ по карте алиасов
      if (type === 'explosive' && typeof game[weaponName] === 'object') {
        const source = game[weaponName];
        let bombs = null;

        const ensureBombs = () => {
          if (bombs === null) {
            ensureCopy();
            // копия берётся из result: там уже могут лежать инъекции null
            // по локальным ключам похороненных бомб
            bombs = { ...result[weaponName] };
            result[weaponName] = bombs;
          }
        };

        for (const id in source) {
          if (!Object.hasOwn(source, id)) {
            continue;
          }

          const data = source[id];

          // строка под известным алиасом (в первую очередь null детонации)
          // переезжает под локальный ключ: под ним сущность живёт с самого спавна
          if (Object.hasOwn(this._bombAliases, id)) {
            const { localId } = this._bombAliases[id];

            ensureBombs();
            delete bombs[id];
            bombs[localId] = data;

            if (data === null) {
              delete this._bombAliases[id];
            }

            continue;
          }

          // чужой взрыв проходит напрямую — удаляет чужую сущность
          if (data === null) {
            continue;
          }

          if (myId !== null && data[5] === myId) {
            const index = this._pendingBombs.findIndex(
              p => p.weaponName === weaponName,
            );

            if (index !== -1) {
              const [pending] = this._pendingBombs.splice(index, 1);

              // сущность уже стоит под локальным id, и он остаётся её именем
              // до самой детонации: серверная строка переезжает под этот ключ
              // (parse уйдёт в update, а не в create — звук и таймер целы) и
              // одноразово поправляет позицию на авторитетную
              ensureBombs();
              delete bombs[id];
              bombs[pending.localId] = data;
              this._bombAliases[id] = { localId: pending.localId, time: localNow };
            }
          }
        }

        // блок пустым остаться не может: обе ветки выше взамен удалённого
        // серверного ключа пишут локальный, поэтому чистка пустышки (как в
        // hitscan-ветке) здесь не нужна
      }
    }

    return result;
  }

  // сброс режима игрок/наблюдатель (KEYSET_DATA): локальные ставки на
  // выстрелы аннулируются, но подтверждённые бомбы продолжают жить под
  // своими локальными id — их снимет серверный null детонации, который
  // приходит позже keySet
  resetLocal() {
    this._pendingTracers = [];
    this._buryPendingBombs();
    this._cooldownUntil = {};
    this._ammo = {};
    this._tanks = {};
    this._currentWeapon = this._modelData?.currentWeapon ?? null;
  }

  // полный сброс (смена карты/clear)
  reset() {
    this.resetLocal();
    this._bombAliases = {};
    // resetLocal() похоронил pending, но после CLEAR полотно чистится
    // целиком — доставлять null некому
    this._expiredLocalBombs = [];
  }

  // хоронит неподтверждённые локальные бомбы: null по локальному id уйдёт
  // в ближайший кадр, иначе спрайт останется на полотне
  _buryPendingBombs() {
    for (const pending of this._pendingBombs) {
      this._expiredLocalBombs.push({
        localId: pending.localId,
        weaponName: pending.weaponName,
      });
    }

    this._pendingBombs = [];
  }

  // собирает данные трассера: реплика формул Tank.getMuzzlePosition/
  // getFireDirection + приближённый raycast вместо world.castRay
  _buildTracer(weapon, renderState, shooterId) {
    const totalAngle = renderState.angle + renderState.gunRotation;

    // дуло: смещение width·0.55 от центра (width = size·4, как Tank)
    const width = this._modelData.size * 4;
    const muzzleOffset = rotateVec(new Vec2(width * 0.55, 0), totalAngle);
    const muzzle = new Vec2(
      renderState.x + muzzleOffset.x,
      renderState.y + muzzleOffset.y,
    );

    let direction = rotateVec(FORWARD, totalAngle);

    if (weapon.spread > 0) {
      direction = rotateVec(
        direction,
        randomRange(-weapon.spread, weapon.spread),
      );
    }

    direction.normalize();

    const range = weapon.range || 1000;
    const hitResult = this._castRay(muzzle, direction, range, shooterId);
    const hit = hitResult !== null;
    const endDistance = hit ? hitResult.distance : range;
    let endX = muzzle.x + direction.x * endDistance;
    let endY = muzzle.y + direction.y * endDistance;

    // якорь попадания в динамику карты (девятый элемент, только локально —
    // никогда не уходит в сеть): позволяет ShotEffectController привязать
    // облако осколков к трансформу задетого ящика, а не к мировой точке
    let anchor = null;

    if (hit && hitResult.target?.key && this._mapDynamics) {
      const key = hitResult.target.key;
      const local = this._mapDynamics.toLocal(key, endX, endY);

      if (local) {
        anchor = [key, local.x, local.y];

        // луч шёл по симуляционной геометрии, а ящик нарисован в другом
        // фрейме (сглаживание/интерполяция) — конец трассера переносится
        // в ту же материальную точку нарисованного ящика, иначе на едущем
        // ящике он обрывался бы в воздухе
        const drawn = this._mapDynamics.toWorld(key, local.x, local.y);

        if (drawn) {
          endX = drawn.x;
          endY = drawn.y;
        }
      }
    }

    const tracer = [
      muzzle.x,
      muzzle.y,
      endX,
      endY,
      renderState.x,
      renderState.y,
      hit,
      shooterId,
    ];

    if (anchor) {
      tracer.push(anchor);
    }

    return tracer;
  }

  // ближайшее пересечение со стенами, динамикой карты и танками (кроме
  // своего); null = промах в пределах range
  // @returns {{distance: number, target: {key: string}|{gameId: number}|null}|null}
  _castRay(origin, direction, range, myId) {
    let closest = null;

    const consider = (distance, target) => {
      if (distance !== null && (closest === null || distance < closest.distance)) {
        closest = { distance, target };
      }
    };

    if (this._grid) {
      consider(rayVsGrid(origin, direction, range, this._grid), null);
    }

    if (this._mapDynamics) {
      // симуляционные, а не рендерные боксы: попадание должно совпасть
      // с серверным, а не с картинкой (см. MapDynamics)
      const boxes = this._mapDynamics.getSimBoxes();

      for (const key in boxes) {
        if (Object.hasOwn(boxes, key)) {
          consider(rayVsBox(origin, direction, range, boxes[key]), { key });
        }
      }
    }

    for (const id in this._tanks) {
      if (Object.hasOwn(this._tanks, id) && Number(id) !== myId) {
        const tank = this._tanks[id];

        // габариты танка: width = size·4, height = size·3 (как Tank)
        consider(
          rayVsBox(origin, direction, range, {
            x: tank.x,
            y: tank.y,
            angle: tank.angle,
            halfW: tank.size * 2,
            halfH: tank.size * 1.5,
          }),
          { gameId: Number(id) },
        );
      }
    }

    return closest;
  }

  // отбрасывает протухшие неподтверждённые выстрелы
  _trimPending(localNow) {
    const minTime = localNow - PENDING_MAX_AGE;

    while (this._pendingTracers.length && this._pendingTracers[0].time < minTime) {
      this._pendingTracers.shift();
    }

    // истёкшие бомбы собираются в очередь на null-инъекцию (очищают холст)
    while (this._pendingBombs.length && this._pendingBombs[0].time < minTime) {
      const expired = this._pendingBombs.shift();

      this._expiredLocalBombs.push({ localId: expired.localId, weaponName: expired.weaponName });
    }

    // страховка от утечки, если null детонации потерялся
    const aliasMinTime = localNow - BOMB_ALIAS_MAX_AGE;

    for (const id in this._bombAliases) {
      if (
        Object.hasOwn(this._bombAliases, id) &&
        this._bombAliases[id].time < aliasMinTime
      ) {
        delete this._bombAliases[id];
      }
    }
  }
}
