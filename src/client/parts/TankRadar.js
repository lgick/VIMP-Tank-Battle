import { Container, Sprite } from 'pixi.js';

export default class TankRadar extends Container {
  constructor(data, assets) {
    super();

    this.zIndex = 2;

    this._textures = assets.tankRadarTexture;

    this.body = new Sprite();
    this.body.anchor.set(0.5);

    this.addChild(this.body);

    // параметры с сервера: [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this._condition = data[6];
    this._teamID = data[8];

    // масштаб контейнера
    this.scale.set(10, 10);

    this.create();
  }

  create() {
    // если танк уничтожен
    if (this._condition === 0) {
      this.body.texture = this._textures.destroyed;
    } else {
      // определение текстуры в зависимости от команды
      if (this._teamID === 1) {
        this.body.texture = this._textures.liveTeamID1;
      } else if (this._teamID === 2) {
        this.body.texture = this._textures.liveTeamID2;
      }
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];

    const newCondition = data[6];
    const needsVisualChange = (this._condition === 0) !== (newCondition === 0);

    this._condition = newCondition;

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
