import { Container, Sprite } from 'pixi.js';

// функция линейной интерполяции
function lerp(start, end, amt) {
  return (1 - amt) * start + amt * end;
}

export default class Tank extends Container {
  constructor(data, assets, dependencies) {
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

    this._soundManager = dependencies.soundManager;
    this._soundId = null;
    this._soundsInitialized = false;
    this._currentVolume = 0;
    this._soundSmoothingFactor = 0.05; // коэффициент сглаживания
    this._speedRatio = 0;

    this._maxSpeed = 240; // максимальная скорость, соответствует серверной

    // первоначальная установка визуального состояния
    this.create();
  }

  // запускает звуки двигателя танка
  _initSounds() {
    if (this._soundsInitialized || this._condition === 0) {
      return;
    }

    this._soundId = this._soundManager.play('tankEngine', {
      loop: true,
      volume: 0,
    });

    if (this._soundId) {
      this._soundManager.registerSpatialSound(
        this._soundId,
        () => ({ x: this.x, y: this.y }),
        () => this._currentVolume,
        () => 1.0 + this._speedRatio * 0.1,
      );
    }

    this._soundsInitialized = true;
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

      // При уничтожении останавливаем все звуки
      this.destroySounds();
    } else {
      // если танк "ожил" или создан впервые
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

      this._initSounds();
    }
  }

  update(data) {
    this.x = data[0];
    this.y = data[1];
    this.rotation = data[2];
    this.gun.rotation = data[3];

    // обновление звуковой логики
    if (this._soundsInitialized && this._condition > 0) {
      const vX = data[4] || 0;
      const vY = data[5] || 0;
      const currentSpeed = Math.hypot(vX, vY);

      this._speedRatio = Math.min(currentSpeed / this._maxSpeed, 1.0);

      // громкость = 0.3 при простое → до 0.8 при движении
      const targetVolume = 0.3 + 0.5 * this._speedRatio;

      this._currentVolume = lerp(
        this._currentVolume,
        targetVolume,
        this._soundSmoothingFactor,
      );
    }

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

  // останавливает и сбрасывает все звуки, связанные с танком
  destroySounds() {
    if (this._soundsInitialized && this._soundId) {
      this._soundManager.stopById(this._soundId);
      this._soundManager.unregisterSpatialSound(this._soundId);
      this._soundId = null;
      this._soundsInitialized = false;
    }
  }

  destroy(options) {
    this.destroySounds();

    super.destroy({
      children: true,
      texture: false, // текстуры общие, не должны уничтожаться
      baseTexture: false,
      ...options,
    });
  }
}
