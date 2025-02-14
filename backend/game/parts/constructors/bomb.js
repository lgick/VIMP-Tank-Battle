import planck from 'planck';

class Bomb {
  constructor(data) {
    this._bulletSet = data.bulletSet;
    this._bulletData = data.bulletData;
    this._time = data.bulletSet.time;
    this._body = null; // тело пока не создано
  }

  // Метод для создания тела в переданном мире
  initBody(world) {
    // Создаём тело через world.createBody
    this._body = world.createBody({
      type: 'dynamic',
      position: { x: this._bulletData[0], y: this._bulletData[1] }, // the body's origin position.
      angle: this._bulletData[4],
      // При необходимости можно указать velocity, angularVelocity и т.д.
    });

    // Добавляем форму к телу (fixture)
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
        'Тело ещё не создано. Необходимо вызвать initBody(world)',
      );
    }
    return this._body;
  }

  // Возвращает данные модели
  getData() {
    const pos = this.getBody().getPosition();
    return [~~pos.x.toFixed(2), ~~pos.y.toFixed(2), this._time];
  }

  // Обновление данных (реализация зависит от логики игры)
  update(data, cb) {
    // Реализация обновления
  }
}

export default Bomb;
