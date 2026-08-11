import { degToRad } from '../lib/math.js';
import { boxCenterFromOrigin } from '../lib/collision.js';

// Единый источник геометрии динамики карты для клиентского предсказания:
// ShotPredictor (raycast трассера) и TankPredictor (столкновения своего
// танка) должны видеть одни и те же боксы, иначе точка попадания и упор
// в ящик расходятся между собой. Хранит боксы уже в виде ЦЕНТРА (в отличие
// от снапшота c1/c2, где [x, y, angle] — угол объекта, см. Map.js сервера) —
// это соглашение задокументировано в docs/*/network.md.
//
// Геометрию задаёт только setMap (MAP_DATA), заменяя её целиком. Метода
// сброса здесь намеренно нет: CLEAR чистит полотно, а не карту, и приходит
// в том числе на старте раунда БЕЗ последующей MAP_DATA (RoundManager
// _startRound). Сброс по CLEAR стирал бы боксы навсегда — update() обновляет
// только уже известные ключи, — и танк с трассером переставали бы видеть
// динамику карты после первого же раунда.

export default class MapDynamics {
  constructor() {
    this._sizes = {}; // dN → { halfW, halfH }
    this._boxes = {}; // dN → { x, y, angle, halfW, halfH } (центр)
  }

  // данные карты (MAP_DATA): размеры и стартовые трансформы динамики
  setMap({ physicsDynamic, scale }) {
    this._sizes = {};
    this._boxes = {};

    (physicsDynamic || []).forEach((item, index) => {
      const key = `d${index}`;
      const halfW = (item.width * scale) / 2;
      const halfH = (item.height * scale) / 2;
      const angle = degToRad(item.angle);
      const originX = item.position[0] * scale;
      const originY = item.position[1] * scale;
      const center = boxCenterFromOrigin(originX, originY, angle, halfW, halfH);

      this._sizes[key] = { halfW, halfH };
      this._boxes[key] = { x: center.x, y: center.y, angle, halfW, halfH };
    });
  }

  // обновляет трансформы из игровых данных (дискретный кадр или
  // интерполированный сэмпл): { cN: { dN: [x, y, angle] } }
  update(game) {
    if (!game) {
      return;
    }

    for (const key in game) {
      if (!Object.hasOwn(game, key) || !key.startsWith('c')) {
        continue;
      }

      const items = game[key];

      for (const dKey in items) {
        if (Object.hasOwn(items, dKey) && this._sizes[dKey]) {
          const [x, y, angle] = items[dKey];
          const { halfW, halfH } = this._sizes[dKey];
          const center = boxCenterFromOrigin(x, y, angle, halfW, halfH);

          this._boxes[dKey] = { x: center.x, y: center.y, angle, halfW, halfH };
        }
      }
    }
  }

  // бокс одного элемента (центр) или null
  getBox(key) {
    return this._boxes[key] || null;
  }

  // все боксы (для raycast/коллизий)
  getBoxes() {
    return this._boxes;
  }

  /**
   * Переводит мировую точку в локальный (неповёрнутый) фрейм ящика —
   * для привязки эффекта попадания к телу.
   * @returns {{x: number, y: number}|null} null, если ключ неизвестен.
   */
  toLocal(key, worldX, worldY) {
    const box = this._boxes[key];

    if (!box) {
      return null;
    }

    const cos = Math.cos(-box.angle);
    const sin = Math.sin(-box.angle);
    const relX = worldX - box.x;
    const relY = worldY - box.y;

    return {
      x: cos * relX - sin * relY,
      y: sin * relX + cos * relY,
    };
  }
}
