// Минимальный двухтельный решатель контактов (sequential impulse) для
// клиентского предсказания: танк, ящики динамики карты и стены живут в одной
// симуляции, поэтому нарисованные тела не выдавливают друг друга.
// Это приближение Rapier, а не его копия: остаток расхождения прячет
// реконсиляция (TankPredictor.onServerState + MapDynamics.finishReconcile).
//
// Формат тела:
//   { x, y, angle, vx, vy, angvel,
//     invMass, invInertia, linearDamping, angularDamping }
// Статика (стена) — invMass: 0, invInertia: 0.
// x/y — ЦЕНТР бокса (не «угол объекта» снапшота, см. collision.js).

import { clamp, normalizeAngle } from './math.js';

/**
 * Один шаг интеграции тела.
 * Порядок обязан совпадать с TankPredictor._step: позиция интегрируется
 * скоростью ДО демпфирования, хранится задемпфированная скорость.
 * Порядок эмпирический, повторяет Rapier и закреплён паритет-тестом.
 * @param {Object} body - Тело в формате модуля (мутируется).
 * @param {number} dt - Шаг в секундах.
 */
export const integrate = (body, dt) => {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  body.angle = normalizeAngle(body.angle + body.angvel * dt);

  const linear = 1 / (1 + dt * (body.linearDamping || 0));
  const angular = 1 / (1 + dt * (body.angularDamping || 0));

  body.vx *= linear;
  body.vy *= linear;
  body.angvel *= angular;
};

/**
 * Разводит тела на глубину проникновения пропорционально обратным массам.
 * Вызывается ОДИН раз на контакт за шаг: повторное применение той же глубины
 * на каждой итерации решателя расталкивало бы тела кратно числу итераций.
 * @param {Object} a - Тело A (нормаль направлена ОТ него).
 * @param {Object} b - Тело B.
 * @param {{nx: number, ny: number, depth: number}} contact
 */
export const separateBodies = (a, b, { nx, ny, depth }) => {
  const total = a.invMass + b.invMass;

  // два статических тела — разводить нечего
  if (total === 0) {
    return;
  }

  a.x -= (nx * depth * a.invMass) / total;
  a.y -= (ny * depth * a.invMass) / total;
  b.x += (nx * depth * b.invMass) / total;
  b.y += (ny * depth * b.invMass) / total;
};

/**
 * Нормальный импульс с отскоком плюс кулоновское трение по касательной.
 * Итерируется решателем (sequential impulse) по всем контактам шага.
 * Мутирует скорости обоих тел, позиций не трогает.
 * @param {Object} a - Тело A (нормаль направлена ОТ него).
 * @param {Object} b - Тело B.
 * @param {{nx: number, ny: number, cx: number, cy: number}} contact
 *   Контакт в формате obbVsObb (src/lib/collision.js).
 * @param {Object} params
 * @param {number} params.restitution - Отскок (комбинированный, 0–1).
 * @param {number} params.friction - Трение (комбинированное).
 */
export const applyContactImpulse = (a, b, contact, { restitution, friction }) => {
  const { nx, ny, cx, cy } = contact;

  if (a.invMass + b.invMass === 0) {
    return;
  }

  // плечи от центров тел до точки контакта
  const rax = cx - a.x;
  const ray = cy - a.y;
  const rbx = cx - b.x;
  const rby = cy - b.y;

  // скорости материальных точек контакта (v + ω × r)
  const vax = a.vx - a.angvel * ray;
  const vay = a.vy + a.angvel * rax;
  const vbx = b.vx - b.angvel * rby;
  const vby = b.vy + b.angvel * rbx;

  const vrelX = vbx - vax;
  const vrelY = vby - vay;
  const vn = vrelX * nx + vrelY * ny;

  // точки уже расходятся — импульс не нужен, коррекция позиции остаётся
  if (vn >= 0) {
    return;
  }

  const rnA = rax * ny - ray * nx;
  const rnB = rbx * ny - rby * nx;
  const effN =
    a.invMass + b.invMass + rnA * rnA * a.invInertia + rnB * rnB * b.invInertia;

  if (effN === 0) {
    return;
  }

  const jn = (-(1 + restitution) * vn) / effN;

  a.vx -= nx * jn * a.invMass;
  a.vy -= ny * jn * a.invMass;
  a.angvel -= rnA * jn * a.invInertia;
  b.vx += nx * jn * b.invMass;
  b.vy += ny * jn * b.invMass;
  b.angvel += rnB * jn * b.invInertia;

  // трение по касательной, зажатое кулоновским конусом
  const tx = -ny;
  const ty = nx;
  const vt = vrelX * tx + vrelY * ty;

  const rtA = rax * ty - ray * tx;
  const rtB = rbx * ty - rby * tx;
  const effT =
    a.invMass + b.invMass + rtA * rtA * a.invInertia + rtB * rtB * b.invInertia;

  if (effT === 0) {
    return;
  }

  const maxFriction = friction * jn;
  const jt = clamp(-vt / effT, -maxFriction, maxFriction);

  a.vx -= tx * jt * a.invMass;
  a.vy -= ty * jt * a.invMass;
  a.angvel -= rtA * jt * a.invInertia;
  b.vx += tx * jt * b.invMass;
  b.vy += ty * jt * b.invMass;
  b.angvel += rtB * jt * b.invInertia;
};

/**
 * Полное разрешение контакта: развод по глубине плюс импульс.
 * Удобно для одиночного контакта; решатель с несколькими итерациями
 * должен звать separateBodies и applyContactImpulse раздельно.
 * @param {Object} a - Тело A (нормаль направлена ОТ него).
 * @param {Object} b - Тело B.
 * @param {{nx: number, ny: number, depth: number, cx: number, cy: number}} contact
 * @param {{restitution: number, friction: number}} params
 */
export const resolveContact = (a, b, contact, params) => {
  separateBodies(a, b, contact);
  applyContactImpulse(a, b, contact, params);
};
