// запас прозрачных пикселей вокруг фигуры под размытие
// BlurFilter Pixi (ядро 5, несколько проходов) даёт сигму ≈ 1.29 * strength,
// поэтому 4 * strength ≈ 3 сигмы: у границы кадра альфа падает ниже 1%
// без запаса generateTexture обрезает размытие рамкой,
// и спрайт получает видимый прямоугольный край
const BLUR_SPREAD_FACTOR = 4;

export default function blurMargin(strength) {
  return Math.ceil(strength * BLUR_SPREAD_FACTOR);
}
