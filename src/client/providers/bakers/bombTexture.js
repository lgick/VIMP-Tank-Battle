import { Graphics, Rectangle } from 'pixi.js';

// создает текстуру для бомбы
// params.colorOuter - Цвет внешней рамки
// params.colorInner - Цвет внутренней заливки
// renderer - PIXI рендерер
export default function bombTexture(params, renderer) {
  const { colorOuter, colorInner } = params;
  const graphics = new Graphics();

  // базовый размер
  const size = 40;
  const borderWidth = 2;
  const radius = size / 2;

  // внешний контур
  graphics.circle(radius, radius, radius).fill(colorOuter);

  // внутренняя часть
  graphics.circle(radius, radius, radius - borderWidth).fill(colorInner);

  const texture = renderer.generateTexture({
    target: graphics,
    frame: new Rectangle(0, 0, size, size),
  });

  graphics.destroy(true);

  return texture;
}
