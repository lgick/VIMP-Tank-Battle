import { degToRad, normalizeAngle } from '../lib/math.js';
import { boxCenterFromOrigin, obbVsObb } from '../lib/collision.js';
import { boxMassProperties, integrate, MAP_SURFACE } from '../lib/rigidBody.js';
import { rotateVec } from '../lib/vec2.js';

// Единый источник геометрии динамики карты И её предиктор.
//
// Зачем предиктор: свой танк рисуется «сейчас» (TankPredictor), а всё
// остальное — с задержкой интерполяции. Пока ящик стоит, разницы нет; как
// только его толкают, нарисованный ящик отстаёт от авторитетного, и танк
// законно оказывается внутри нарисованного ящика. Поэтому тела, связанные
// со своим танком, переводятся в режим 'predicted' и шагаются в ОДНОЙ
// симуляции с ним — выдавливать друг друга им нечем.
//
// Охват намеренно узкий: остальные тела остаются в 'follow' (интерполяция).
// Иначе ящик, который толкает ЧУЖОЙ танк, опережал бы его спрайт — со
// стороны это выглядит как толчок на расстоянии.
//
// Часов симуляции у класса нет: шагает его TankPredictor (integratePredicted,
// decayError), поэтому контакт танк↔ящик разрешается в одном шаге, а replay
// при реконсиляции автоматически переигрывает и ящики.
//
// Боксы хранятся как ЦЕНТР (в отличие от снапшота c1/c2, где [x, y, angle] —
// угол объекта, см. Map.js сервера); соглашение задокументировано
// в docs/*/network.md. У геометрии два вида, и потребитель обязан брать свой:
//   getBox/getBoxes/toWorld — РЕНДЕРНЫЙ бокс (состояние + сглаживающая
//     ошибка): где ящик нарисован. Для спрайтов и эффектов (ShotEffectController);
//   getSimBoxes/toLocal — СИМУЛЯЦИОННЫЙ бокс: где ящик у сервера. Для
//     raycast'а выстрела (ShotPredictor) — по той же причине, по которой
//     выстрел строится из TankPredictor.getSimState(), а не из рендерного:
//     иначе локальное попадание расходится с серверным.
//
// Геометрию задаёт только setMap (MAP_DATA), заменяя её целиком. Метода
// сброса здесь намеренно нет: CLEAR чистит полотно, а не карту, и приходит
// в том числе на старте раунда БЕЗ последующей MAP_DATA (RoundManager
// _startRound). Сброс по CLEAR стирал бы боксы навсегда — update() обновляет
// только уже известные ключи, — и танк с трассером переставали бы видеть
// динамику карты после первого же раунда.

// насколько раздувается OBB танка при проверке захвата тела в предсказание
const CAPTURE_MARGIN = 2;

// сколько тело держится предсказанным после последнего контакта (мс)
const PREDICTION_HOLD_MS = 300;

// потолок предсказанного множества: транзитивный захват в стене canopy
// (20 ящиков) иначе втянул бы её целиком
const MAX_PREDICTED_BODIES = 12;

// скорость затухания ошибки предсказания (доля в секунду, как у танка)
const ERROR_DECAY_RATE = 10;

// порог расхождения (юнитов), выше которого ошибка снапится
const ERROR_SNAP_DISTANCE = 24;

// насколько предсказание должно сойтись с интерполяцией для возврата в follow
const DEMOTE_POSITION_EPSILON = 1;
const DEMOTE_ANGLE_EPSILON = 0.02;

// «угол объекта» из центра бокса — обратный перевод boxCenterFromOrigin
const originFromBoxCenter = (cx, cy, angle, halfW, halfH) => {
  const offset = rotateVec({ x: halfW, y: halfH }, angle);

  return { x: cx - offset.x, y: cy - offset.y };
};

export default class MapDynamics {
  constructor() {
    this._bodies = {}; // dN → состояние тела (см. setMap)
    this._setId = null; // ключ блока динамики текущей карты (c1/c2)
    this._reconcileSnapshots = null; // предсказание до replay (beginReconcile)
  }

  // данные карты (MAP_DATA): геометрия, масс-инерционные свойства и
  // стартовые трансформы динамики
  setMap({ physicsDynamic, scale, setId }) {
    this._bodies = {};
    this._setId = setId ?? null;

    (physicsDynamic || []).forEach((item, index) => {
      const key = `d${index}`;
      const width = item.width * scale;
      const height = item.height * scale;
      const halfW = width / 2;
      const halfH = height / 2;
      const angle = degToRad(item.angle);
      const originX = item.position[0] * scale;
      const originY = item.position[1] * scale;
      const center = boxCenterFromOrigin(originX, originY, angle, halfW, halfH);

      this._bodies[key] = {
        halfW,
        halfH,
        x: center.x,
        y: center.y,
        angle,
        vx: 0,
        vy: 0,
        angvel: 0,
        // масса и момент инерции прямоугольника (как у Rapier на сервере)
        ...boxMassProperties(width, height, item.density ?? 0),
        linearDamping: item.linearDamping ?? 0,
        angularDamping: item.angularDamping ?? 0.01,
        // поверхность ящика; в контакте комбинируется правилом среднего
        friction: MAP_SURFACE.friction,
        restitution: MAP_SURFACE.restitution,
        mode: 'follow',
        error: { x: 0, y: 0, angle: 0 },
        lastContactTime: -Infinity,
        // последний интерполированный трансформ — то, как тело нарисовали бы
        // в режиме follow; по нему решается возврат из предсказания
        follow: { x: center.x, y: center.y, angle },
        // приходил ли авторитетный кадр (beginReconcile). До первого кадра
        // lastServer — это стартовый трансформ карты, ему верить нельзя
        hasServer: false,
        lastServer: {
          x: center.x,
          y: center.y,
          angle,
          vx: 0,
          vy: 0,
          angvel: 0,
        },
      };
    });
  }

  // обновляет трансформы из игровых данных (дискретный кадр или
  // интерполированный сэмпл): { cN: { dN: [x, y, angle] } }.
  // Состоянием предсказанных тел владеет симуляция, им обновляется только
  // follow — эталон, по которому решается возврат в интерполяцию.
  update(game) {
    // ключи dN индексные: блок ЧУЖОГО конструктора карт (другой setId) увёл бы
    // тела текущей карты в чужие координаты, поэтому берётся только свой
    const items = this._setId === null ? null : game?.[this._setId];

    if (!items) {
      return;
    }

    for (const dKey in items) {
      const body = this._bodies[dKey];

      if (!Object.hasOwn(items, dKey) || !body) {
        continue;
      }

      const [x, y, angle] = items[dKey];
      const center = boxCenterFromOrigin(x, y, angle, body.halfW, body.halfH);

      body.follow = { x: center.x, y: center.y, angle };

      if (body.mode === 'follow') {
        body.x = center.x;
        body.y = center.y;
        body.angle = angle;
      }
    }
  }

  /**
   * Принимает авторитетный кадр перед replay предиктора: запоминает
   * серверное состояние всех тел, а предсказанным подменяет состояние
   * авторитетным (сохранив копию для finishReconcile).
   * @param {Object} snapshot - Сырой снапшот кадра.
   */
  beginReconcile(snapshot) {
    this._reconcileSnapshots = null;

    const items = snapshot?.[this._setId];

    if (!items) {
      return;
    }

    const saved = {};

    for (const dKey in items) {
      const body = this._bodies[dKey];

      if (!Object.hasOwn(items, dKey) || !body) {
        continue;
      }

      const data = items[dKey];
      const angle = data[2];
      const center = boxCenterFromOrigin(
        data[0],
        data[1],
        angle,
        body.halfW,
        body.halfH,
      );

      body.hasServer = true;

      // короткий кадр (3 числа) — тело покоится, скорости нулевые
      body.lastServer = {
        x: center.x,
        y: center.y,
        angle,
        vx: data[3] ?? 0,
        vy: data[4] ?? 0,
        angvel: data[5] ?? 0,
      };

      if (body.mode !== 'predicted') {
        continue;
      }

      saved[dKey] = { x: body.x, y: body.y, angle: body.angle };

      body.x = body.lastServer.x;
      body.y = body.lastServer.y;
      body.angle = body.lastServer.angle;
      body.vx = body.lastServer.vx;
      body.vy = body.lastServer.vy;
      body.angvel = body.lastServer.angvel;
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

    for (const dKey in saved) {
      const body = this._bodies[dKey];

      if (!Object.hasOwn(saved, dKey) || !body || body.mode !== 'predicted') {
        continue;
      }

      const old = saved[dKey];

      body.error.x += old.x - body.x;
      body.error.y += old.y - body.y;
      body.error.angle += normalizeAngle(old.angle - body.angle);

      // слишком большое расхождение проще снапнуть, чем протаскивать
      if (Math.hypot(body.error.x, body.error.y) > ERROR_SNAP_DISTANCE) {
        body.error = { x: 0, y: 0, angle: 0 };
      }
    }
  }

  // шаг интеграции предсказанных тел (часы — у TankPredictor)
  integratePredicted(dt) {
    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && body.mode === 'predicted') {
        integrate(body, dt);
      }
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
   * Переводит в 'predicted' тела, связанные со своим танком: прямой контакт
   * плюс транзитивно соседи по контакту (стопка ящиков едет как целое).
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

    const predicted = this.getPredictedBodies();
    const seeds = [];

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (!Object.hasOwn(this._bodies, key) || body.mode === 'predicted') {
        continue;
      }

      if (obbVsObb(inflated, this._toObb(body))) {
        seeds.push(body);
      }
    }

    for (const body of seeds) {
      if (predicted.length >= MAX_PREDICTED_BODIES) {
        break;
      }

      this._promote(body, localNow);
      predicted.push(body);
    }

    // транзитивное замыкание: соседи предсказанных тоже предсказываются
    let grown = true;

    while (grown && predicted.length < MAX_PREDICTED_BODIES) {
      grown = false;

      for (const key in this._bodies) {
        const body = this._bodies[key];

        if (
          !Object.hasOwn(this._bodies, key) ||
          body.mode === 'predicted' ||
          predicted.length >= MAX_PREDICTED_BODIES
        ) {
          continue;
        }

        const obb = this._toObb(body, CAPTURE_MARGIN);

        if (predicted.some(other => obbVsObb(obb, this._toObb(other)))) {
          this._promote(body, localNow);
          predicted.push(body);
          grown = true;
        }
      }
    }
  }

  /**
   * Отмечает контакт предсказанных тел — продлевает удержание в предсказании.
   * @param {Array<Object>} bodies - Тела из getPredictedBodies.
   * @param {number} localNow - performance.now().
   */
  noteContacts(bodies, localNow) {
    for (const body of bodies) {
      body.lastContactTime = localNow;
    }
  }

  /**
   * Возвращает в 'follow' тела, которые давно не контактировали И чьё
   * предсказание сошлось с интерполяцией: иначе возврат дал бы скачок.
   * @param {number} localNow - performance.now().
   */
  demoteIdle(localNow) {
    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (!Object.hasOwn(this._bodies, key) || body.mode !== 'predicted') {
        continue;
      }

      if (localNow - body.lastContactTime <= PREDICTION_HOLD_MS) {
        continue;
      }

      const follow = body.follow;
      const deltaAngle = normalizeAngle(body.angle - follow.angle);
      const converged =
        Math.hypot(body.x - follow.x, body.y - follow.y) <
          DEMOTE_POSITION_EPSILON &&
        Math.abs(deltaAngle) < DEMOTE_ANGLE_EPSILON;

      if (!converged) {
        continue;
      }

      // Возврат безопасен именно потому, что схождение уже проверено:
      // остаток ограничен эпсилонами, скачка не видно.
      this._demote(body);
    }
  }

  /**
   * Безусловный возврат всех тел в 'follow'.
   * Шагает предсказанные тела TankPredictor, и когда он перестал (спектатор,
   * уничтоженный танк, ожидание первого authoritative-кадра), тела иначе
   * зависли бы предсказанными навсегда: demoteIdle зовётся только из шага
   * симуляции, а getRenderData() перекрывает интерполяцию каждый кадр.
   * Схождение здесь не проверяется — ждать его не от кого.
   */
  releasePredicted() {
    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && body.mode === 'predicted') {
        this._demote(body);
      }
    }
  }

  // экспоненциальное затухание ошибки (в точности как _visualError танка)
  decayError(elapsed) {
    const decay = Math.max(0, 1 - (elapsed / 1000) * ERROR_DECAY_RATE);

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && body.mode === 'predicted') {
        body.error.x *= decay;
        body.error.y *= decay;
        body.error.angle *= decay;
      }
    }
  }

  // рендерный бокс одного элемента (центр) или null
  getBox(key) {
    const body = this._bodies[key];

    return body ? this._toRenderObb(body) : null;
  }

  // все рендерные боксы (для raycast/эффектов)
  getBoxes() {
    const result = {};

    for (const key in this._bodies) {
      if (Object.hasOwn(this._bodies, key)) {
        result[key] = this._toRenderObb(this._bodies[key]);
      }
    }

    return result;
  }

  /**
   * Боксы в том виде, в каком их видит сервер «сейчас» (для raycast).
   * @returns {Object} key → OBB (центр).
   */
  getSimBoxes() {
    const result = {};

    for (const key in this._bodies) {
      if (Object.hasOwn(this._bodies, key)) {
        result[key] = this._toSimObb(this._bodies[key]);
      }
    }

    return result;
  }

  /**
   * Данные для рендера предсказанных тел в соглашении «угол объекта» —
   * ровно то, что ждёт src/client/parts/Map.js update().
   * @returns {Object|null} { [setId]: { dN: [x, y, angle] } } или null,
   *   если предсказанных тел нет.
   */
  getRenderData() {
    if (this._setId === null) {
      return null;
    }

    const items = {};
    let hasAny = false;

    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (!Object.hasOwn(this._bodies, key) || body.mode !== 'predicted') {
        continue;
      }

      const angle = body.angle + body.error.angle;
      const origin = originFromBoxCenter(
        body.x + body.error.x,
        body.y + body.error.y,
        angle,
        body.halfW,
        body.halfH,
      );

      items[key] = [origin.x, origin.y, angle];
      hasAny = true;
    }

    return hasAny ? { [this._setId]: items } : null;
  }

  /**
   * Переводит мировую точку СИМУЛЯЦИИ в локальный (неповёрнутый) фрейм ящика —
   * для привязки эффекта попадания к телу. Фрейм именно симуляционный: точка
   * приходит из raycast'а по getSimBoxes, а материальная точка ящика в обоих
   * фреймах имеет одни и те же локальные координаты.
   * @returns {{x: number, y: number}|null} null, если ключ неизвестен.
   */
  toLocal(key, worldX, worldY) {
    const body = this._bodies[key];

    if (!body) {
      return null;
    }

    const box = this._toSimObb(body);

    const cos = Math.cos(-box.angle);
    const sin = Math.sin(-box.angle);
    const relX = worldX - box.x;
    const relY = worldY - box.y;

    return {
      x: cos * relX - sin * relY,
      y: sin * relX + cos * relY,
    };
  }

  /**
   * Обратный toLocal: локальная точка тела → мировая в РЕНДЕРНОМ фрейме.
   * Тем и полезен, что фреймы разные: конец трассера считается по симуляции,
   * а рисуется там, где ящик виден.
   * @returns {{x: number, y: number}|null} null, если ключ неизвестен.
   */
  toWorld(key, localX, localY) {
    const box = this.getBox(key);

    if (!box) {
      return null;
    }

    const cos = Math.cos(box.angle);
    const sin = Math.sin(box.angle);

    return {
      x: box.x + cos * localX - sin * localY,
      y: box.y + sin * localX + cos * localY,
    };
  }

  // OBB тела по его локальному состоянию (решателю ошибка не нужна)
  _toObb(body, margin = 0) {
    return {
      x: body.x,
      y: body.y,
      angle: body.angle,
      halfW: body.halfW + margin,
      halfH: body.halfH + margin,
    };
  }

  // OBB тела в том виде, в каком его видит сервер «сейчас»:
  //   predicted — своё состояние, оно и есть «сейчас» (ошибка косметическая);
  //   follow — последний авторитетный кадр, а НЕ интерполированный трансформ:
  //     тот отстаёт на interpolation.delay, и по едущему ящику луч ушёл бы
  //     мимо. Остаток расхождения ограничен интервалом снапшота.
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

  // OBB тела в том виде, в каком оно нарисовано (со сглаживающей ошибкой)
  _toRenderObb(body) {
    return {
      x: body.x + body.error.x,
      y: body.y + body.error.y,
      angle: body.angle + body.error.angle,
      halfW: body.halfW,
      halfH: body.halfH,
    };
  }

  // перевод тела в предсказание: состояние засевается авторитетным кадром
  // (до первого такого кадра — интерполированным, иначе тело телепортнётся
  // в стартовый трансформ карты)
  _promote(body, localNow) {
    const server = body.hasServer ? body.lastServer : body.follow;

    // едущее тело нарисовано интерполяцией, то есть отстаёт от авторитетного
    // на задержку интерполяции: подмена состояния без компенсации дёрнула бы
    // спрайт на delay×v (десятки сантиметров корпуса). Разница уходит в
    // ошибку и затухает, как всякое другое расхождение подсистемы
    const renderX = body.x + body.error.x;
    const renderY = body.y + body.error.y;
    const renderAngle = body.angle + body.error.angle;

    body.mode = 'predicted';
    body.x = server.x;
    body.y = server.y;
    body.angle = server.angle;
    body.vx = server.vx ?? 0;
    body.vy = server.vy ?? 0;
    body.angvel = server.angvel ?? 0;
    body.lastContactTime = localNow;
    body.error = {
      x: renderX - body.x,
      y: renderY - body.y,
      angle: normalizeAngle(renderAngle - body.angle),
    };

    // расхождение больше порога проще снапнуть, чем протаскивать
    if (Math.hypot(body.error.x, body.error.y) > ERROR_SNAP_DISTANCE) {
      body.error = { x: 0, y: 0, angle: 0 };
    }
  }

  // возврат тела в интерполяцию: ошибку обнуляем — нарисованное тело дальше
  // ведёт интерполяция, и ненулевая ошибка развела бы спрайт с боксом трассера
  _demote(body) {
    body.mode = 'follow';
    body.x = body.follow.x;
    body.y = body.follow.y;
    body.angle = body.follow.angle;
    body.vx = 0;
    body.vy = 0;
    body.angvel = 0;
    body.error = { x: 0, y: 0, angle: 0 };
  }
}
