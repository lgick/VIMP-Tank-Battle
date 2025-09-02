import { Container, Sprite } from 'pixi.js';

export default class TankRadar extends Container {
  constructor(data, assets) {
    super();

    this.zIndex = 2;

    this._textures = assets.tankRadarTexture;

    this.body = new Sprite();
    this.body.anchor.set(0.5);

    this.addChild(this.body);

    // параметры с сервера:
    // [x, y, rotation, gunRotation, vX, vY, condition, size, teamId]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this._condition = data[6];
    this._teamId = data[8];

    // масштаб контейнера
    this.scale.set(7, 7);

    this.create();
  }

  create() {
    // если танк уничтожен
    if (this._condition === 0) {
      this.body.texture = this._textures.destroyed;
    } else {
      // определение текстуры в зависимости от команды
      if (this._teamId === 1) {
        this.body.texture = this._textures.liveTeamId1;
      } else if (this._teamId === 2) {
        this.body.texture = this._textures.liveTeamId2;
      }
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];

    const newCondition = data[6];
    const teamId = data[8];
    let needsVisualChange = false;

    if (newCondition !== undefined && newCondition !== this._condition) {
      this._condition = newCondition;
      needsVisualChange = true;
    }

    if (teamId !== undefined && teamId !== this._teamId) {
      this._teamId = teamId;
      needsVisualChange = true;
    }

    // если визуальное представление требуется изменить
    if (needsVisualChange) {
      this.create();
    }
  }

  destroy(options) {
    super.destroy({
      children: true,
      texture: false, // текстуры общие
      baseTexture: false,
      ...options,
    });

    this.body = null;
    this._textures = null;
  }
}
