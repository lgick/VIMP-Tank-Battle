import planck from 'planck';

class Bullet {
  constructor(data) {
    // Сохраняем параметры для последующего создания тела
    this._bulletSet = data.bulletSet;
    this._bulletData = data.bulletData;

    // Извлекаем необходимые параметры
    this._vX = data.bulletData[2];
    this._vY = data.bulletData[3];
    this._angle = data.bulletData[4];

    // Тело будет создано позже через initBody
    this._body = null;
  }

  // Метод для создания тела в переданном мире
  initBody(world) {
    this._body = world.createBody({
      type: 'dynamic',
      position: { x: this._bulletData[0], y: this._bulletData[1] }, // the body's origin position.
      angle: this._angle,
      // Дополнительно можно указать velocity, если это нужно
    });

    // Устанавливаем линейную скорость, если необходимо
    this._body.setLinearVelocity(this._vX, this._vY);

    // Добавляем fixture с формой круга.
    this._body.createFixture({
      shape: new planck.CircleShape(
        new planck.Vec2(this._bulletSet.width / 2, this._bulletSet.height / 2),
        // radius: 2x?
      ),
      density: this._bulletSet.mass || 20,
    });
  }

  // Возвращает тело модели
  getBody() {
    if (!this._body) {
      throw new Error(
        'Тело ещё не создано. Вызовите initBody(world) для его инициализации.',
      );
    }
    return this._body;
  }

  // Возвращает данные (например, позицию и скорость)
  getData() {
    const pos = this.getBody().getPosition();
    return [
      ~~pos.x.toFixed(2),
      ~~pos.y.toFixed(2),
      this._vX,
      this._vY,
      this._angle,
    ];
  }

  // Обновляет данные
  update(data, cb) {
    // Обычно обновление производится физическим движком (world.step)
    // Если нужна дополнительная логика, реализуйте её здесь.
    // Пример (необязательно):
    // const body = this.getBody();
    // const pos = body.getPosition();
    // body.setPosition(planck.Vec2(pos.x + this._vX, pos.y + this._vY));
  }
}

export default Bullet;
