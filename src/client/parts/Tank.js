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

    this._textures = {
      tank1Normal: assets.tank1Texture.normal,
      tank2Normal: assets.tank2Texture.normal,
      tank1Destroyed: assets.tank1Texture.destroyed,
      tank2Destroyed: assets.tank2Texture.destroyed,
    };

    // параметры с сервера: [x, y, rotation, gunRotation, vX, vY, condition, size, teamID]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;
    this.gun.rotation = data[3] || 0;
    this._condition = data[6];
    this._size = data[7];

    // соотношение сторон танка: 4(width):3(height)
    this._width = this._size * 4;
    this._height = this._size * 3;

    this._teamID = data[8];

    // правильный якорь для пушки в зависимости от команды
    const gunAnchorData = (
      this._teamID === 1
        ? this._textures.tank1Normal
        : this._textures.tank2Normal
    ).gunAnchor;

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
    let normalTextures;
    let destroyedTexture;

    // набор текстур в зависимости от команды
    if (this._teamID === 1) {
      normalTextures = this._textures.tank1Normal;
      destroyedTexture = this._textures.tank1Destroyed;
    } else if (this._teamID === 2) {
      normalTextures = this._textures.tank2Normal;
      destroyedTexture = this._textures.tank2Destroyed;
      // заглушка для наблюдателей или неопределенных команд, чтобы танк не отображался
    } else {
      this.body.visible = false;
      this.gun.visible = false;
      this.wreck.visible = false;
      return;
    }

    // если танк уничтожен
    if (this._condition === 0) {
      this.body.visible = false;
      this.gun.visible = false;

      this.wreck.texture = destroyedTexture;
      this.wreck.visible = true;

      // поворот башни, так как она теперь часть обломков
      this.gun.rotation = 0;
    } else {
      // если танк в нормальном состоянии
      this.wreck.visible = false;

      this.body.texture = normalTextures.body;
      this.gun.texture = normalTextures.gun;

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
      texture: false, // текстуры общие, не должны уничтожаться
      baseTexture: false,
      ...options,
    });
  }
}
