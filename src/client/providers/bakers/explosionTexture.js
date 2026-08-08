import { Graphics, BlurFilter, Rectangle } from 'pixi.js';
import blurMargin from './blurMargin.js';

// создает текстуру размытого круга
// params.radius - Радиус круга
// params.blur - Сила размытия
// params.color - Цвет заливки
// renderer - PIXI рендерер
export default function explosionTexture(params, renderer) {
  const { radius, blur, color } = params;
  const graphics = new Graphics();

  // круг остаётся радиусом radius, вокруг него - прозрачный запас под размытие
  const textureSize = (radius + blurMargin(blur)) * 2;
  const center = textureSize / 2;

  graphics.circle(center, center, radius);
  graphics.fill(color);

  graphics.filters = [new BlurFilter({ strength: blur, quality: 40 })];

  const texture = renderer.generateTexture({
    target: graphics,
    frame: new Rectangle(0, 0, textureSize, textureSize),
  });

  graphics.destroy(true);

  return texture;
}
