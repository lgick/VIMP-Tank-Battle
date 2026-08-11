import { normalizeAngle } from '../lib/math.js';
import { obbVsObb } from '../lib/collision.js';
import { integrate } from '../lib/rigidBody.js';

// Предсказание ЧУЖИХ танков, находящихся в контакте со своим.
//
// Зачем: свой танк рисуется «сейчас» (TankPredictor), чужие — с задержкой
// интерполяции (100 мс). Пока танки не соприкасаются, разницы не видно; при
// толчке она вылезает с обеих сторон сразу: толкающий въезжает в нарисованный
// чужой корпус (клиент контакт вообще не разрешал), а тот, кого толкают,
// видит зазор — толкающий нарисован там, где был 100 мс назад.
//
// Лечение то же, что у динамики карты (MapDynamics): танк, попавший в
// контакт, переводится в режим 'predicted', экстраполируется на «сейчас» и
// участвует в общем двухтельном контакте одной симуляции.
//
// ⚠️ Охват намеренно узкий — только контактирующие танки. Предсказывать всех
// подряд значит показывать дрожание экстраполяции там, где интерполяция
// работает безупречно.
//
// ⚠️ Экстраполяция идёт БЕЗ демпфирования: ввод чужого игрока неизвестен, а
// едущий танк держит газ, то есть его скорость за эти 100 мс примерно
// постоянна. Применить демпфирование модели значило бы тормозить чужой танк
// на ровном месте (linear 3 съедает ~23% скорости за 100 мс).

// насколько раздувается OBB своего танка при проверке захвата
const CAPTURE_MARGIN = 2;

// Упреждение проверки захвата (с). Критерий «корпуса уже пересеклись» здесь
// не работает: на экране толкаемого чужой танк нарисован там, где был
// serverNow − delay, то есть ЕЩЁ НЕ ДОЕХАЛ — контакт не наступит никогда,
// и предсказание не включится. Поэтому проверка идёт по авторитетной позиции,
// сдвинутой вперёд по её же скорости; захватить чуть раньше безвредно
// (предсказанное тело просто точно следует за сервером), опоздать — нет.
const CAPTURE_LOOKAHEAD = 0.2;

// сколько танк держится предсказанным после последнего контакта (мс)
const PREDICTION_HOLD_MS = 300;

// потолок предсказанного множества (свалка из танков в узком проходе)
const MAX_PREDICTED_TANKS = 6;

// скорость затухания ошибки предсказания (доля в секунду, как у своего танка)
const ERROR_DECAY_RATE = 10;

// порог расхождения (юнитов), выше которого ошибка снапится
const ERROR_SNAP_DISTANCE = 24;

// насколько предсказание должно сойтись с интерполяцией для возврата в follow
const DEMOTE_POSITION_EPSILON = 1;
const DEMOTE_ANGLE_EPSILON = 0.02;

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

export default class RemoteTanks {
  /**
   * @param {Object} models - Конфиги моделей танков (models.js).
   */
  constructor(models) {
    this._models = models || {};
    this._bodies = {}; // `${modelKey}:${gameId}` → тело
    this._ownGameId = null;
    this._reconcileSnapshots = null;
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
    if (!game) {
      return;
    }

    for (const modelKey in game) {
      if (!Object.hasOwn(game, modelKey) || !this._models[modelKey]) {
        continue;
      }

      const tanks = game[modelKey];

      for (const gameId in tanks) {
        if (!Object.hasOwn(tanks, gameId)) {
          continue;
        }

        const key = `${modelKey}:${gameId}`;
        const data = tanks[gameId];

        if (data === null || String(gameId) === this._ownGameId) {
          delete this._bodies[key];
          continue;
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
      }
    }
  }

  /**
   * Принимает авторитетный кадр перед replay предиктора.
   * @param {Object} snapshot - Сырой снапшот кадра.
   */
  beginReconcile(snapshot) {
    this._reconcileSnapshots = null;

    if (!snapshot) {
      return;
    }

    const saved = {};

    for (const modelKey in snapshot) {
      if (!Object.hasOwn(snapshot, modelKey) || !this._models[modelKey]) {
        continue;
      }

      const tanks = snapshot[modelKey];

      for (const gameId in tanks) {
        const key = `${modelKey}:${gameId}`;
        const body = this._bodies[key];
        const data = tanks[gameId];

        if (!Object.hasOwn(tanks, gameId) || !body || data === null) {
          continue;
        }

        body.hasServer = true;
        body.lastServer = {
          x: data[IDX.x],
          y: data[IDX.y],
          angle: data[IDX.angle],
          vx: data[IDX.vx],
          vy: data[IDX.vy],
          angvel: data[IDX.angvel] ?? 0,
        };

        if (body.mode !== 'predicted') {
          continue;
        }

        saved[key] = { x: body.x, y: body.y, angle: body.angle };

        Object.assign(body, body.lastServer);
      }
    }

    this._reconcileSnapshots = saved;
  }

  // после replay: расхождение старого предсказания с новым — в ошибку
  finishReconcile() {
    const saved = this._reconcileSnapshots;

    this._reconcileSnapshots = null;

    if (!saved) {
      return;
    }

    for (const key in saved) {
      const body = this._bodies[key];

      if (!Object.hasOwn(saved, key) || !body || body.mode !== 'predicted') {
        continue;
      }

      const old = saved[key];

      body.error.x += old.x - body.x;
      body.error.y += old.y - body.y;
      body.error.angle += normalizeAngle(old.angle - body.angle);

      if (Math.hypot(body.error.x, body.error.y) > ERROR_SNAP_DISTANCE) {
        body.error = { x: 0, y: 0, angle: 0 };
      }
    }
  }

  // шаг экстраполяции предсказанных танков (часы — у TankPredictor)
  integratePredicted(dt) {
    for (const body of this.getPredictedBodies()) {
      integrate(body, dt);
    }
  }

  // живые (мутируемые) тела для решателя
  getPredictedBodies() {
    const result = [];

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && body.mode === 'predicted') {
        result.push(body);
      }
    }

    return result;
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
    const inflated = {
      x: tankObb.x,
      y: tankObb.y,
      angle: tankObb.angle,
      halfW: tankObb.halfW + CAPTURE_MARGIN,
      halfH: tankObb.halfH + CAPTURE_MARGIN,
    };

    let predictedCount = this.getPredictedBodies().length;

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (
        !Object.hasOwn(this._bodies, key) ||
        body.mode === 'predicted' ||
        predictedCount >= MAX_PREDICTED_TANKS
      ) {
        continue;
      }

      // уничтоженный танк убран из мира сервера — контакта с ним нет
      if (body.meta[2] === 0) {
        continue;
      }

      if (obbVsObb(inflated, this._captureObb(body))) {
        this._promote(body, localNow);
        predictedCount += 1;
      }
    }
  }

  /**
   * Отмечает контакт — продлевает удержание в предсказании.
   * @param {Array<Object>} bodies - Тела из getPredictedBodies.
   * @param {number} localNow - performance.now().
   */
  noteContacts(bodies, localNow) {
    for (const body of bodies) {
      body.lastContactTime = localNow;
    }
  }

  /**
   * Возвращает в 'follow' танки, давно не контактировавшие И сошедшиеся
   * с интерполяцией: схождение и есть гарантия отсутствия скачка.
   * @param {number} localNow - performance.now().
   */
  demoteIdle(localNow) {
    for (const body of this.getPredictedBodies()) {
      if (localNow - body.lastContactTime <= PREDICTION_HOLD_MS) {
        continue;
      }

      const follow = body.follow;
      const converged =
        Math.hypot(body.x - follow.x, body.y - follow.y) <
          DEMOTE_POSITION_EPSILON &&
        Math.abs(normalizeAngle(body.angle - follow.angle)) <
          DEMOTE_ANGLE_EPSILON;

      if (!converged) {
        continue;
      }

      body.error = { x: 0, y: 0, angle: 0 };
      body.mode = 'follow';
      body.x = follow.x;
      body.y = follow.y;
      body.angle = follow.angle;
      body.vx = 0;
      body.vy = 0;
      body.angvel = 0;
    }
  }

  // экспоненциальное затухание ошибки (как visualError своего танка)
  decayError(elapsed) {
    const decay = Math.max(0, 1 - (elapsed / 1000) * ERROR_DECAY_RATE);

    for (const body of this.getPredictedBodies()) {
      body.error.x *= decay;
      body.error.y *= decay;
      body.error.angle *= decay;
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

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (!Object.hasOwn(this._bodies, key) || body.mode !== 'predicted') {
        continue;
      }

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
    }

    return hasAny ? result : null;
  }

  // новое тело в режиме follow (геометрия и масса доопределятся _applySize)
  _createBody(modelKey, gameId) {
    return {
      modelKey,
      gameId,
      halfW: 0,
      halfH: 0,
      size: 0,
      x: 0,
      y: 0,
      angle: 0,
      vx: 0,
      vy: 0,
      angvel: 0,
      invMass: 0,
      invInertia: 0,
      // экстраполяция без демпфирования — см. шапку модуля
      linearDamping: 0,
      angularDamping: 0,
      friction: this._models[modelKey]?.fixture?.friction ?? 0.5,
      restitution: this._models[modelKey]?.fixture?.restitution ?? 0.1,
      mode: 'follow',
      error: { x: 0, y: 0, angle: 0 },
      lastContactTime: -Infinity,
      follow: { x: 0, y: 0, angle: 0 },
      hasServer: false, // приходил ли авторитетный кадр для этого танка
      lastServer: { x: 0, y: 0, angle: 0, vx: 0, vy: 0, angvel: 0 },
      meta: [0, 0, 0, 0, 0],
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
    const mass = density * width * height;
    const inertia = (mass * (width * width + height * height)) / 12;

    body.size = size;
    body.halfW = width / 2;
    body.halfH = height / 2;
    body.invMass = mass > 0 ? 1 / mass : 0;
    body.invInertia = inertia > 0 ? 1 / inertia : 0;
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

  // OBB тела по симуляционному состоянию (решателю ошибка не нужна)
  _toObb(body) {
    return {
      x: body.x,
      y: body.y,
      angle: body.angle,
      halfW: body.halfW,
      halfH: body.halfH,
    };
  }

  // перевод в предсказание: состояние засевается авторитетным кадром;
  // до первого такого кадра сеем интерполированным — иначе тело
  // телепортировалось бы в начало координат
  _promote(body, localNow) {
    if (body.hasServer) {
      Object.assign(body, body.lastServer);
    } else {
      body.x = body.follow.x;
      body.y = body.follow.y;
      body.angle = body.follow.angle;
      body.vx = 0;
      body.vy = 0;
      body.angvel = 0;
    }

    body.mode = 'predicted';
    body.error = { x: 0, y: 0, angle: 0 };
    body.lastContactTime = localNow;
  }
}
