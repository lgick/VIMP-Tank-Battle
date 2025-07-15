import { Container, Sprite } from 'pixi.js';

export default class Tank extends Container {
  constructor(data, assets) {
    super();

    this.zIndex = 3;

    // спрайты для отображения танка
    this.body = new Sprite();
    this.gun = new Sprite();

    // спрайт для уничтоженного состояния
    this.wreck = new Sprite();

    // якоря
    this.body.anchor.set(0.5);
    this.wreck.anchor.set(0.5);

    this.addChild(this.body, this.gun, this.wreck);

    this._textures = assets.tankTexture;

    // параметры с сервера:
    // [x, y, rotation, gunRotation, vX, vY, condition, size, teamId]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;
    this.gun.rotation = data[3] || 0;
    this._condition = data[6];
    this._size = data[7];

    // соотношение сторон танка: 4(width):3(height)
    this._width = this._size * 4;
    this._height = this._size * 3;

    this._teamId = data[8];

    // правильный якорь для пушки в зависимости от команды
    const liveTextures =
      this._teamId === 1
        ? this._textures.liveTeamId1
        : this._textures.liveTeamId2;
    const gunAnchorData = liveTextures ? liveTextures.gunAnchor : null;

    if (gunAnchorData) {
      this.gun.anchor.set(gunAnchorData.x, gunAnchorData.y);
    } else {
      this.gun.anchor.set(0.5); // запасной вариант
    }

    // коэффициент масштабирования, чтобы соответствовать размеру танка
    const BAKER_BASE_SIZE = 10; // размер, использованный в текстурах
    const scaleFactor = this._size / BAKER_BASE_SIZE;

    // масштаб ко всем спрайтам
    this.body.scale.set(scaleFactor);
    this.gun.scale.set(scaleFactor);
    this.wreck.scale.set(scaleFactor);

    // первоначальная установка визуального состояния
    this.create();
  }

  create() {
    // если танк уничтожен
    if (this._condition === 0) {
      this.body.visible = false;
      this.gun.visible = false;

      this.wreck.texture = this._textures.destroyed;
      this.wreck.visible = true;

      // поворот башни, так как она теперь часть обломков
      this.gun.rotation = 0;
      // если танк в нормальном состоянии
    } else {
      this.wreck.visible = false;

      let liveTextures;

      // набор текстур в зависимости от команды
      if (this._teamId === 1) {
        liveTextures = this._textures.liveTeamId1;
      } else if (this._teamId === 2) {
        liveTextures = this._textures.liveTeamId2;
      }

      this.body.texture = liveTextures.body;
      this.gun.texture = liveTextures.gun;
      this.body.visible = true;
      this.gun.visible = true;
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];
    this.rotation = data[2];
    this.gun.rotation = data[3];

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
      texture: false, // текстуры общие, не должны уничтожаться
      baseTexture: false,
      ...options,
    });
  }
}
