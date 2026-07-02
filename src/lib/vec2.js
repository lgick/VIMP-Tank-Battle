// Двумерный вектор с planck-совместимым подмножеством API.
// Заменяет planck.Vec2/Rot в серверной физике и ботах; переиспользуется
// клиентом (prediction, Фаза 5b). Методы экземпляра мутируют вектор
// (как в planck), статики возвращают новые векторы.

export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  // ***** статики (новый вектор / число) ***** //

  static add(a, b) {
    return new Vec2(a.x + b.x, a.y + b.y);
  }

  static sub(a, b) {
    return new Vec2(a.x - b.x, a.y - b.y);
  }

  static dot(a, b) {
    return a.x * b.x + a.y * b.y;
  }

  // 2D cross-произведение (скаляр)
  static cross(a, b) {
    return a.x * b.y - a.y * b.x;
  }

  static distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  static distanceSquared(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;

    return dx * dx + dy * dy;
  }

  static clone(v) {
    return new Vec2(v.x, v.y);
  }

  // ***** методы (мутируют вектор, возвращают this) ***** //

  add(v) {
    this.x += v.x;
    this.y += v.y;

    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;

    return this;
  }

  mul(scalar) {
    this.x *= scalar;
    this.y *= scalar;

    return this;
  }

  normalize() {
    const length = Math.hypot(this.x, this.y);

    if (length > 0) {
      this.x /= length;
      this.y /= length;
    }

    return this;
  }

  clone() {
    return new Vec2(this.x, this.y);
  }

  length() {
    return Math.hypot(this.x, this.y);
  }

  lengthSquared() {
    return this.x * this.x + this.y * this.y;
  }
}

/**
 * Поворачивает вектор на угол (замена planck `Rot.mulVec2(new Rot(a), v)`).
 * @param {{x: number, y: number}} v
 * @param {number} angle - Радианы.
 * @returns {Vec2} Новый вектор.
 */
export const rotateVec = (v, angle) => {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  return new Vec2(cos * v.x - sin * v.y, sin * v.x + cos * v.y);
};
