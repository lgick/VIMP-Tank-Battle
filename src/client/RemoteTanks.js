import { obbVsObb } from '../lib/collision.js';
import { boxMassProperties } from '../lib/rigidBody.js';
import PredictedSet from './PredictedSet.js';

// Предсказание ЧУЖИХ танков, находящихся в контакте со своим.
//
// Зачем: свой танк рисуется «сейчас» (TankPredictor), чужие — с задержкой
// интерполяции (100 мс). Пока танки не соприкасаются, разницы не видно; при
// толчке она вылезает с обеих сторон сразу: толкающий въезжает в нарисованный
// чужой корпус (клиент контакт вообще не разрешал), а тот, кого толкают,
// видит зазор — толкающий нарисован там, где был 100 мс назад.
//
// Механика предсказания (режимы follow/predicted, реконсиляция, сглаживание
// ошибки, возврат в интерполяцию) — в PredictedSet.js, общая с MapDynamics;
// здесь только своё: чтение блока модели, правило захвата и формат рендера.
//
// ⚠️ Охват намеренно узкий — только контактирующие танки. Предсказывать всех
// подряд значит показывать дрожание экстраполяции там, где интерполяция
// работает безупречно.
//
// ⚠️ Экстраполяция идёт БЕЗ демпфирования: ввод чужого игрока неизвестен, а
// едущий танк держит газ, то есть его скорость за эти 100 мс примерно
// постоянна. Применить демпфирование модели значило бы тормозить чужой танк
// на ровном месте (linear 3 съедает ~23% скорости за 100 мс).

// Упреждение проверки захвата (с). Критерий «корпуса уже пересеклись» здесь
// не работает: на экране толкаемого чужой танк нарисован там, где был
// serverNow − delay, то есть ЕЩЁ НЕ ДОЕХАЛ — контакт не наступит никогда,
// и предсказание не включится. Поэтому проверка идёт по авторитетной позиции,
// сдвинутой вперёд по её же скорости; захватить чуть раньше безвредно
// (предсказанное тело просто точно следует за сервером), опоздать — нет.
const CAPTURE_LOOKAHEAD = 0.2;

// потолок предсказанного множества (свалка из танков в узком проходе)
const MAX_PREDICTED_TANKS = 6;

// индексы массива танка в снапшоте (протокол v5)
const IDX = {
  x: 0,
  y: 1,
  angle: 2,
  gun: 3,
  vx: 4,
  vy: 5,
  engineLoad: 6,
  condition: 7,
  size: 8,
  teamId: 9,
  angvel: 10,
};

export default class RemoteTanks extends PredictedSet {
  /**
   * @param {Object} models - Конфиги моделей танков (models.js).
   */
  constructor(models) {
    super(MAX_PREDICTED_TANKS);

    this._models = models || {};
    this._bodies = {}; // `${modelKey}:${gameId}` → тело
    this._ownGameId = null;
  }

  // свой танк исключается из предсказания и контактов (им владеет предиктор)
  setOwnGameId(gameId) {
    this._ownGameId = gameId === null ? null : String(gameId);
  }

  // смена карты/очистка полотна: чужие танки заводятся заново кадрами
  reset() {
    this._bodies = {};
    this._reconcileSnapshots = null;
  }

  /**
   * Обновляет чужие танки из игровых данных (дискретный кадр или
   * интерполированный сэмпл). Предсказанным телам обновляется только follow —
   * эталон, по которому решается возврат в интерполяцию.
   * @param {Object} game - Блоки снапшота.
   */
  update(game) {
    this._eachTankEntry(game, (key, data, modelKey, gameId) => {
      if (data === null || String(gameId) === this._ownGameId) {
        delete this._bodies[key];
        return;
      }

      const body = this._bodies[key] || this._createBody(modelKey, gameId);

      body.meta = [
        data[IDX.gun],
        data[IDX.engineLoad],
        data[IDX.condition],
        data[IDX.size],
        data[IDX.teamId],
      ];
      body.follow = {
        x: data[IDX.x],
        y: data[IDX.y],
        angle: data[IDX.angle],
      };
      this._applySize(body, data[IDX.size]);

      if (body.mode === 'follow') {
        body.x = data[IDX.x];
        body.y = data[IDX.y];
        body.angle = data[IDX.angle];
      }

      this._bodies[key] = body;
    });
  }

  /**
   * Переводит в 'predicted' чужие танки, попавшие в раздутый OBB своего.
   * Транзитивного замыкания нет: цепочка «танк толкает танк толкает танк»
   * практически не встречается, а лишние предсказанные тела — это лишнее
   * дрожание на чужих экранах.
   * @param {{x,y,angle,halfW,halfH}} tankObb - OBB своего танка.
   * @param {number} localNow - performance.now().
   */
  capture(tankObb, localNow) {
    const inflated = this._inflateTank(tankObb);
    let predictedCount = this._countPredicted();

    // обломки (condition 0) захватываются наравне с живыми: их тело сервер из
    // мира не убирает (removePlayer зовётся только на выходе игрока, смене
    // команды и новом раунде), а значит они остаются толкаемым препятствием
    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (
        !Object.hasOwn(this._bodies, key) ||
        body.mode === 'predicted' ||
        predictedCount >= this._maxPredicted
      ) {
        continue;
      }

      if (obbVsObb(inflated, this._captureObb(body))) {
        this._promote(body, localNow);
        predictedCount += 1;
      }
    }
  }

  /**
   * Данные предсказанных танков для рендера — тот же формат блока модели,
   * что и у снапшота, поэтому идут обычным applyGameData.
   * @returns {Object|null} { [modelKey]: { gameId: [...] } } или null.
   */
  getRenderData() {
    const result = {};
    let hasAny = false;

    this._forEachPredicted(body => {
      const [gun, engineLoad, condition, size, teamId] = body.meta;

      result[body.modelKey] = result[body.modelKey] || {};
      result[body.modelKey][body.gameId] = [
        body.x + body.error.x,
        body.y + body.error.y,
        body.angle + body.error.angle,
        gun,
        body.vx,
        body.vy,
        engineLoad,
        condition,
        size,
        teamId,
        body.angvel,
      ];
      hasAny = true;
    });

    return hasAny ? result : null;
  }

  /**
   * Корпуса в том виде, в каком их видит сервер «сейчас» (для raycast).
   * Обломки (`condition 0`) остаются в выдаче: сервер их коллайдер не
   * убирает, и луч обязан утыкаться в них так же, как у него.
   * @returns {Object} gameId → OBB (центр корпуса).
   */
  getSimBoxes() {
    const result = {};

    for (const key in this._bodies) {
      if (Object.hasOwn(this._bodies, key)) {
        const body = this._bodies[key];

        result[body.gameId] = this._toSimObb(body);
      }
    }

    return result;
  }

  /**
   * Переносит мировую точку из СИМУЛЯЦИОННОГО фрейма корпуса в РЕНДЕРНЫЙ.
   * Луч считается там, где танк у сервера, а рисуется трассер там, где танк
   * виден: по едущему корпусу это разные места (`delay×v` — до габарита),
   * и без переноса трассер обрывался бы в воздухе.
   * @returns {{x: number, y: number}|null} null, если танк неизвестен.
   */
  toRenderPoint(gameId, worldX, worldY) {
    const body = this._findByGameId(gameId);

    if (!body) {
      return null;
    }

    const sim = this._toSimObb(body);
    const cos = Math.cos(-sim.angle);
    const sin = Math.sin(-sim.angle);
    const relX = worldX - sim.x;
    const relY = worldY - sim.y;
    const localX = cos * relX - sin * relY;
    const localY = sin * relX + cos * relY;

    // рендерный фрейм: состояние плюс сглаживающая ошибка (для follow-тела
    // ошибка нулевая, и это ровно интерполированный трансформ)
    const angle = body.angle + body.error.angle;
    const renderCos = Math.cos(angle);
    const renderSin = Math.sin(angle);

    return {
      x: body.x + body.error.x + renderCos * localX - renderSin * localY,
      y: body.y + body.error.y + renderSin * localX + renderCos * localY,
    };
  }

  // чтение авторитетного кадра для реконсиляции (см. PredictedSet)
  _eachSnapshotBody(snapshot, visit) {
    this._eachTankEntry(snapshot, (key, data) => {
      const body = this._bodies[key];

      if (!body || data === null) {
        return;
      }

      visit(key, body, {
        x: data[IDX.x],
        y: data[IDX.y],
        angle: data[IDX.angle],
        vx: data[IDX.vx],
        vy: data[IDX.vy],
        angvel: data[IDX.angvel] ?? 0,
      });
    });
  }

  // обход блоков известных моделей: { modelKey: { gameId: [...] | null } }
  _eachTankEntry(game, visit) {
    for (const modelKey in game) {
      if (!Object.hasOwn(game, modelKey) || !this._models[modelKey]) {
        continue;
      }

      const tanks = game[modelKey];

      for (const gameId in tanks) {
        if (Object.hasOwn(tanks, gameId)) {
          visit(`${modelKey}:${gameId}`, tanks[gameId], modelKey, gameId);
        }
      }
    }
  }

  // новое тело в режиме follow (геометрия и масса доопределятся _applySize)
  _createBody(modelKey, gameId) {
    const fixture = this._models[modelKey]?.fixture;

    return {
      ...this._makeBody({ x: 0, y: 0, angle: 0 }),
      modelKey,
      gameId,
      halfW: 0,
      halfH: 0,
      size: 0,
      invMass: 0,
      invInertia: 0,
      // экстраполяция без демпфирования — см. шапку модуля
      linearDamping: 0,
      angularDamping: 0,
      friction: fixture?.friction ?? 0.5,
      restitution: fixture?.restitution ?? 0.1,
      meta: [0, 0, 0, 0, 0],
    };
  }

  // тело по id танка (ключ хранит ещё и модель, а потребители знают только id)
  _findByGameId(gameId) {
    const id = String(gameId);

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && String(body.gameId) === id) {
        return body;
      }
    }

    return null;
  }

  // OBB корпуса в том виде, в каком его видит сервер «сейчас»:
  //   predicted — своё состояние, оно и есть «сейчас» (ошибка косметическая);
  //   follow — последний авторитетный кадр, а НЕ интерполированный трансформ:
  //     тот отстаёт на interpolation.delay, и по едущему танку луч ушёл бы мимо
  _toSimObb(body) {
    let source = body;

    if (body.mode !== 'predicted') {
      source = body.hasServer ? body.lastServer : body.follow;
    }

    return {
      x: source.x,
      y: source.y,
      angle: source.angle,
      halfW: body.halfW,
      halfH: body.halfH,
    };
  }

  // габариты и масса из size кадра (соотношение сторон 4:3, как у Tank)
  _applySize(body, size) {
    if (body.size === size) {
      return;
    }

    const width = size * 4;
    const height = size * 3;
    const density = this._models[body.modelKey]?.fixture?.density ?? 0;

    body.size = size;
    body.halfW = width / 2;
    body.halfH = height / 2;
    Object.assign(body, boxMassProperties(width, height, density));
  }

  // OBB для проверки захвата: авторитетная позиция с упреждением
  // (см. CAPTURE_LOOKAHEAD), а не отстающая интерполированная
  _captureObb(body) {
    const source = body.hasServer ? body.lastServer : body.follow;
    const vx = source.vx ?? 0;
    const vy = source.vy ?? 0;

    return {
      x: source.x + vx * CAPTURE_LOOKAHEAD,
      y: source.y + vy * CAPTURE_LOOKAHEAD,
      angle: source.angle,
      halfW: body.halfW,
      halfH: body.halfH,
    };
  }
}
