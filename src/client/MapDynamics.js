import { degToRad } from '../lib/math.js';
import { boxCenterFromOrigin, obbVsObb } from '../lib/collision.js';
import { boxMassProperties, MAP_SURFACE } from '../lib/rigidBody.js';
import { rotateVec } from '../lib/vec2.js';
import PredictedSet, { CAPTURE_MARGIN } from './PredictedSet.js';

// Единый источник геометрии динамики карты И её предиктор.
//
// Механика предсказания (режимы follow/predicted, реконсиляция, сглаживание
// ошибки, возврат в интерполяцию) — в PredictedSet.js; здесь только своё:
// геометрия ящиков, чтение блока cN, правило захвата и два взгляда на бокс.
//
// Охват намеренно узкий: тела, не связанные со своим танком, остаются в
// 'follow'. Иначе ящик, который толкает ЧУЖОЙ танк, опережал бы его спрайт —
// со стороны это выглядит как толчок на расстоянии.
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

// потолок предсказанного множества: транзитивный захват в стене canopy
// (20 ящиков) иначе втянул бы её целиком
const MAX_PREDICTED_BODIES = 12;

// «угол объекта» из центра бокса — обратный перевод boxCenterFromOrigin
const originFromBoxCenter = (cx, cy, angle, halfW, halfH) => {
  const offset = rotateVec({ x: halfW, y: halfH }, angle);

  return { x: cx - offset.x, y: cy - offset.y };
};

export default class MapDynamics extends PredictedSet {
  constructor() {
    super(MAX_PREDICTED_BODIES);

    this._setId = null; // ключ блока динамики текущей карты (c1/c2)
  }

  // данные карты (MAP_DATA): геометрия, масс-инерционные свойства и
  // стартовые трансформы динамики
  setMap({ physicsDynamic, scale, setId }) {
    this._bodies = {};
    this._setId = setId ?? null;

    (physicsDynamic || []).forEach((item, index) => {
      const width = item.width * scale;
      const height = item.height * scale;
      const halfW = width / 2;
      const halfH = height / 2;
      const angle = degToRad(item.angle);
      const originX = item.position[0] * scale;
      const originY = item.position[1] * scale;
      const center = boxCenterFromOrigin(originX, originY, angle, halfW, halfH);

      this._bodies[`d${index}`] = {
        ...this._makeBody({ x: center.x, y: center.y, angle }),
        halfW,
        halfH,
        // масса и момент инерции прямоугольника (как у Rapier на сервере)
        ...boxMassProperties(width, height, item.density ?? 0),
        linearDamping: item.linearDamping ?? 0,
        angularDamping: item.angularDamping ?? 0.01,
        // поверхность ящика; в контакте комбинируется правилом среднего
        friction: MAP_SURFACE.friction,
        restitution: MAP_SURFACE.restitution,
      };
    });
  }

  // обновляет трансформы из игровых данных (дискретный кадр или
  // интерполированный сэмпл): { cN: { dN: [x, y, angle] } }.
  // Состоянием предсказанных тел владеет симуляция, им обновляется только
  // follow — эталон, по которому решается возврат в интерполяцию.
  update(game) {
    this._eachBlockBody(game, (body, data) => {
      const [x, y, angle] = data;
      const center = boxCenterFromOrigin(x, y, angle, body.halfW, body.halfH);

      body.follow = { x: center.x, y: center.y, angle };

      if (body.mode === 'follow') {
        body.x = center.x;
        body.y = center.y;
        body.angle = angle;
      }
    });
  }

  /**
   * Переводит в 'predicted' тела, связанные со своим танком: прямой контакт
   * плюс транзитивно соседи по контакту (стопка ящиков едет как целое).
   * @param {{x,y,angle,halfW,halfH}} tankObb - OBB своего танка.
   * @param {number} localNow - performance.now().
   */
  capture(tankObb, localNow) {
    const inflated = this._inflateTank(tankObb);
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
      if (predicted.length >= this._maxPredicted) {
        break;
      }

      this._promote(body, localNow);
      predicted.push(body);
    }

    // транзитивное замыкание: соседи предсказанных тоже предсказываются
    let grown = true;

    while (grown && predicted.length < this._maxPredicted) {
      grown = false;

      for (const key in this._bodies) {
        const body = this._bodies[key];

        if (
          !Object.hasOwn(this._bodies, key) ||
          body.mode === 'predicted' ||
          predicted.length >= this._maxPredicted
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

  // рендерный бокс одного элемента (центр) или null
  getBox(key) {
    const body = this._bodies[key];

    return body ? this._toRenderObb(body) : null;
  }

  // все рендерные боксы (для эффектов)
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

  // чтение авторитетного кадра для реконсиляции (см. PredictedSet)
  _eachSnapshotBody(snapshot, visit) {
    this._eachBlockBody(snapshot, (body, data, key) => {
      const angle = data[2];
      const center = boxCenterFromOrigin(
        data[0],
        data[1],
        angle,
        body.halfW,
        body.halfH,
      );

      // короткий кадр (3 числа) — тело покоится, скорости нулевые
      visit(key, body, {
        x: center.x,
        y: center.y,
        angle,
        vx: data[3] ?? 0,
        vy: data[4] ?? 0,
        angvel: data[5] ?? 0,
      });
    });
  }

  // обход известных тел в блоке динамики своей карты. Ключи dN индексные:
  // блок ЧУЖОГО конструктора карт (другой setId) увёл бы тела текущей карты
  // в чужие координаты, поэтому берётся только свой
  _eachBlockBody(game, visit) {
    const items = this._setId === null ? null : game?.[this._setId];

    if (!items) {
      return;
    }

    for (const key in items) {
      const body = this._bodies[key];

      if (Object.hasOwn(items, key) && body) {
        visit(body, items[key], key);
      }
    }
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
}
