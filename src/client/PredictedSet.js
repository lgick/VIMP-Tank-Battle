import { normalizeAngle } from '../lib/math.js';
import { integrate } from '../lib/rigidBody.js';

// Общая механика подсистемы предсказанного мира: множество тел, каждое из
// которых живёт либо в режиме 'follow' (трансформ ведёт интерполяция), либо
// в 'predicted' (телом владеет симуляция TankPredictor).
//
// Зачем режимы: свой танк рисуется «сейчас», всё остальное — с задержкой
// интерполяции (interpolation.delay). Пока тела не соприкасаются, разницы не
// видно; в контакте она вылезает сразу — нарисованное тело отстаёт от
// авторитетного, и танк законно оказывается внутри него. Поэтому связанные
// со своим танком тела считаются в ТОЙ ЖЕ симуляции и в том же времени.
//
// Наследники доопределяют только то, что у них действительно своё:
//   update(game)            — как тела читаются из игровых данных;
//   _eachSnapshotBody(...)  — как они читаются из сырого кадра (реконсиляция);
//   capture(tankObb, now)   — правило захвата в предсказание;
//   getRenderData()         — формат блока для applyGameData.
// Всё остальное (реконсиляция, шаг, ошибка, возврат в интерполяцию) — здесь,
// иначе две подсистемы разъедутся по поведению при первой же правке.
//
// Часов симуляции у подсистемы нет: шагает её TankPredictor
// (integratePredicted, decayError), поэтому контакт со своим танком
// разрешается в одном шаге, а replay реконсиляции переигрывает и её тела.

// насколько раздувается OBB своего танка при проверке захвата
// (экспортируется: тем же запасом MapDynamics замыкает захват по соседям)
export const CAPTURE_MARGIN = 2;

// сколько тело держится предсказанным после последнего контакта (мс)
const PREDICTION_HOLD_MS = 300;

// скорость затухания ошибки предсказания (доля в секунду, как у своего танка)
const ERROR_DECAY_RATE = 10;

// порог расхождения (юнитов), выше которого ошибка снапится
const ERROR_SNAP_DISTANCE = 24;

// насколько предсказание должно сойтись с интерполяцией для возврата в follow
const DEMOTE_POSITION_EPSILON = 1;
const DEMOTE_ANGLE_EPSILON = 0.02;

export default class PredictedSet {
  /**
   * @param {number} maxPredicted - Потолок предсказанного множества: тела
   *   считаются на каждом шаге симуляции, включая replay реконсиляции.
   */
  constructor(maxPredicted) {
    this._maxPredicted = maxPredicted;
    this._bodies = {}; // ключ → тело (наследник решает, что за ключ)
    this._reconcileSnapshots = null; // предсказание до replay (beginReconcile)
  }

  /**
   * Принимает авторитетный кадр перед replay предиктора: запоминает серверное
   * состояние тел, а предсказанным подменяет состояние авторитетным (сохранив
   * копию для finishReconcile).
   * @param {Object} snapshot - Сырой снапшот кадра.
   */
  beginReconcile(snapshot) {
    const saved = {};

    this._reconcileSnapshots = null;

    this._eachSnapshotBody(snapshot, (key, body, server) => {
      body.hasServer = true;
      body.lastServer = server;

      if (body.mode !== 'predicted') {
        return;
      }

      saved[key] = { x: body.x, y: body.y, angle: body.angle };

      body.x = server.x;
      body.y = server.y;
      body.angle = server.angle;
      body.vx = server.vx;
      body.vy = server.vy;
      body.angvel = server.angvel;
    });

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

      this._snapHugeError(body);
    }
  }

  // шаг интеграции предсказанных тел (часы — у TankPredictor)
  integratePredicted(dt) {
    this._forEachPredicted(body => integrate(body, dt));
  }

  // живые (мутируемые) тела для решателя
  getPredictedBodies() {
    const result = [];

    this._forEachPredicted(body => result.push(body));

    return result;
  }

  /**
   * Отмечает контакт — продлевает удержание тел в предсказании.
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
   * предсказание сошлось с интерполяцией: схождение и есть гарантия того,
   * что возврат не даст скачка.
   * @param {number} localNow - performance.now().
   */
  demoteIdle(localNow) {
    this._forEachPredicted(body => {
      if (localNow - body.lastContactTime <= PREDICTION_HOLD_MS) {
        return;
      }

      const follow = body.follow;
      const converged =
        Math.hypot(body.x - follow.x, body.y - follow.y) <
          DEMOTE_POSITION_EPSILON &&
        Math.abs(normalizeAngle(body.angle - follow.angle)) <
          DEMOTE_ANGLE_EPSILON;

      if (converged) {
        this._demote(body);
      }
    });
  }

  /**
   * Безусловный возврат всех тел в 'follow'.
   * Шагает предсказанные тела TankPredictor, и когда он перестал (спектатор,
   * уничтоженный свой танк, ожидание первого authoritative-кадра), вернуть их
   * было бы некому: demoteIdle зовётся только из шага симуляции, а
   * getRenderData() перекрывает интерполяцию каждый кадр — тело застыло бы на
   * экране навсегда. Схождение здесь не проверяется: ждать его не от кого.
   */
  releasePredicted() {
    this._forEachPredicted(body => this._demote(body));
  }

  // экспоненциальное затухание ошибки (в точности как _visualError танка)
  decayError(elapsed) {
    const decay = Math.max(0, 1 - (elapsed / 1000) * ERROR_DECAY_RATE);

    this._forEachPredicted(body => {
      body.error.x *= decay;
      body.error.y *= decay;
      body.error.angle *= decay;
    });
  }

  // обход предсказанных тел без промежуточного массива (горячий путь:
  // зовётся каждый шаг симуляции, включая replay реконсиляции)
  _forEachPredicted(fn) {
    for (const key in this._bodies) {
      const body = this._bodies[key];

      if (Object.hasOwn(this._bodies, key) && body.mode === 'predicted') {
        fn(body);
      }
    }
  }

  // сколько тел уже предсказывается (для потолка множества)
  _countPredicted() {
    let count = 0;

    this._forEachPredicted(() => {
      count += 1;
    });

    return count;
  }

  // общие поля тела: режим, сглаживающая ошибка и оба эталона трансформа
  _makeBody({ x, y, angle }) {
    return {
      x,
      y,
      angle,
      vx: 0,
      vy: 0,
      angvel: 0,
      mode: 'follow',
      error: { x: 0, y: 0, angle: 0 },
      lastContactTime: -Infinity,
      // последний интерполированный трансформ — то, как тело нарисовали бы
      // в режиме follow; по нему решается возврат из предсказания
      follow: { x, y, angle },
      // приходил ли авторитетный кадр (beginReconcile). До первого кадра
      // lastServer — это стартовый трансформ, ему верить нельзя
      hasServer: false,
      lastServer: { x, y, angle, vx: 0, vy: 0, angvel: 0 },
    };
  }

  // OBB тела по его симуляционному состоянию (решателю ошибка не нужна)
  _toObb(body, margin = 0) {
    return {
      x: body.x,
      y: body.y,
      angle: body.angle,
      halfW: body.halfW + margin,
      halfH: body.halfH + margin,
    };
  }

  // OBB своего танка с запасом захвата: контакт лучше предсказать чуть
  // раньше касания, чем опоздать — опоздание видно, ранний захват нет
  _inflateTank(tankObb) {
    return {
      x: tankObb.x,
      y: tankObb.y,
      angle: tankObb.angle,
      halfW: tankObb.halfW + CAPTURE_MARGIN,
      halfH: tankObb.halfH + CAPTURE_MARGIN,
    };
  }

  // перевод тела в предсказание: состояние засевается авторитетным кадром
  // (до первого такого кадра — интерполированным, иначе тело телепортнётся
  // в стартовый трансформ)
  _promote(body, localNow) {
    const server = body.hasServer ? body.lastServer : body.follow;

    // едущее тело нарисовано интерполяцией, то есть отстаёт от авторитетного
    // на interpolation.delay: подмена состояния без компенсации дёрнула бы
    // спрайт на delay×v (для корпуса длиной 8 юнитов это заметно). Разница
    // уходит в ошибку и затухает, как всякое другое расхождение подсистемы
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

    this._snapHugeError(body);
  }

  // возврат тела в интерполяцию: ошибку обнуляем — дальше телом владеет
  // интерполяция, и ненулевая ошибка развела бы спрайт с боксом трассера
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

  // расхождение больше порога проще снапнуть, чем протаскивать сглаживанием
  _snapHugeError(body) {
    if (Math.hypot(body.error.x, body.error.y) > ERROR_SNAP_DISTANCE) {
      body.error = { x: 0, y: 0, angle: 0 };
    }
  }
}
