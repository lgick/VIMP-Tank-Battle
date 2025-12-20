import Publisher from '../../../lib/Publisher.js';

const CAMERA_SETTINGS = {
  // Плавность движения камеры (0.01 - очень плавно/медленно, 1.0 - мгновенно)
  //
  // Определяет, как быстро камера реагирует на изменения скорости и направления.
  // - Меньше (например, 0.001 - 0.01): Камера станет очень «тяжелой»
  // и вальяжной. Она будет долго догонять танк. Подходит для тяжелой техники.
  // - Больше (например, 0.01 - 0.07): Камера станет резкой и отзывчивой.
  // - Слишком много (близко к 0.07): Движения станут дергаными,
  // пропадёт ощущение плавности, будут видны микро-рывки сети.
  LERP_FACTOR: 0.01,

  // Коэффициент смещения камеры вперед (Look-ahead)
  // Чем больше значение, тем дальше камера заглядывает вперед при движении
  //
  // Определяет, насколько сильно камера смещается в сторону движения.
  // Это тот самый эффект, когда танк визуально «отъезжает» назад,
  // открывая обзор впереди.
  // - Больше (например, 25.0): При движении танк окажется почти у самого края
  // экрана (сзади), давая максимальный обзор вперед.
  // Полезно для снайперских перестрелок.
  // - Меньше (например, 5.0): Танк будет лишь слегка смещаться от центра.
  // - 0: Танк всегда строго по центру (классическая камера).
  LOOK_AHEAD_FACTOR: 40.0,

  // Коэффициент уменьшения зума от скорости
  // Чем больше, тем сильнее отдаляется камера при наборе скорости
  //
  // Определяет, как сильно скорость танка влияет на зум.
  // - Больше (например, 0.01): Камера начнет отдаляться даже
  // при небольшой скорости.
  // - Меньше (например, 0.001): Эффект отдаления будет заметен только
  // на очень высоких скоростях (например, при использовании «нитро»
  // или ускорителей).
  ZOOM_OUT_FACTOR: 0.5,
  // Максимальное отдаление (в процентах от базового зума, например 0.7 = 70%)
  //
  // Жесткий лимит, чтобы камера не улетела в космос,
  // если танк разгонится слишком сильно.
  // Значение в процентах от базового масштаба.
  // - Ближе к 1.0 (например, 0.9): Камера отдаляется совсем чуть-чуть.
  // - Ближе к 0 (например, 0.4): Позволяет видеть огромную часть карты
  // при максимальной скорости.
  MIN_ZOOM_LIMIT: 0.6,
};

// линейная интерполяция
function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

// GameView
export default class GameView {
  constructor(model, app) {
    this._app = app;

    this._model = model;

    this.publisher = new Publisher();

    // подписка на события модели
    this._mPublic = this._model.publisher;

    this._mPublic.on('create', 'add', this);
    this._mPublic.on('createEffect', 'addEffect', this);
    this._mPublic.on('remove', 'remove', this);

    // состояние для динамической камеры
    this._prevCoords = null; // предыдущие координаты для расчета скорости
    this._currentLookAhead = { x: 0, y: 0 }; // текущее смещение камеры
    this._currentExtraZoom = 1.0; // множитель зума (1.0 = без изменений)
  }

  // создает экземпляр на полотне
  add(instance) {
    this._app.stage.addChild(instance);

    this._app.stage.sortChildren((a, b) => {
      if (a.layer < b.layer) {
        return -1;
      }

      if (a.layer > b.layer) {
        return 1;
      }

      return 0;
    });
  }

  // создаёт эффект и запускает его
  addEffect(instance) {
    this.add(instance);
    instance.run();
  }

  // вычисляет координаты для отображения
  // пользователя по центру игры и обновляет полотно
  update(coords, baseScale) {
    // расчет вектора скорости на основе изменения координат
    const velocity = { x: 0, y: 0 };

    if (this._prevCoords) {
      velocity.x = coords.x - this._prevCoords.x;
      velocity.y = coords.y - this._prevCoords.y;
    }

    this._prevCoords = { x: coords.x, y: coords.y };

    // скорость (magnitude)
    const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);

    // расчет целевого смещения (look-ahead)
    // смещение камеры в сторону движения
    const targetLookAheadX = velocity.x * CAMERA_SETTINGS.LOOK_AHEAD_FACTOR;
    const targetLookAheadY = velocity.y * CAMERA_SETTINGS.LOOK_AHEAD_FACTOR;

    // плавная интерполяция смещения
    this._currentLookAhead.x = lerp(
      this._currentLookAhead.x,
      targetLookAheadX,
      CAMERA_SETTINGS.LERP_FACTOR,
    );

    this._currentLookAhead.y = lerp(
      this._currentLookAhead.y,
      targetLookAheadY,
      CAMERA_SETTINGS.LERP_FACTOR,
    );

    // расчет динамического зума
    // (чем выше скорость, тем меньше масштаб (отдаление))
    // формула: 1 / (1 + speed * factor) создаст плавную кривую уменьшения
    let targetExtraZoom = 1 / (1 + speed * CAMERA_SETTINGS.ZOOM_OUT_FACTOR);

    // ограничение максимального отдаления
    if (targetExtraZoom < CAMERA_SETTINGS.MIN_ZOOM_LIMIT) {
      targetExtraZoom = CAMERA_SETTINGS.MIN_ZOOM_LIMIT;
    }

    // плавная интерполяция зума
    this._currentExtraZoom = lerp(
      this._currentExtraZoom,
      targetExtraZoom,
      CAMERA_SETTINGS.LERP_FACTOR,
    );

    // итоговый масштаб
    const finalScale = baseScale * this._currentExtraZoom;

    // применение трансформации к сцене
    const width = this._app.canvas.width;
    const height = this._app.canvas.height;

    // центр экрана = (координаты игрока + смещение) * масштаб
    const x = +(
      width / 2 -
      (coords.x + this._currentLookAhead.x) * finalScale
    ).toFixed(2);
    const y = +(
      height / 2 -
      (coords.y + this._currentLookAhead.y) * finalScale
    ).toFixed(2);

    this._app.stage.updateTransform({
      x,
      y,
      scaleX: finalScale,
      scaleY: finalScale,
    });

    this._app.render();
  }

  // удаляет экземпляр с полотна
  remove(instance) {
    instance.destroy();
  }
}
