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

    // соотношение сторон танка: 4(width):3(height)
    this._width = this._size * 4;
    this._height = this._size * 3;

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
    this._maxSpeed = 240; // максимальная скорость, соответствует серверной
    this._soundsInitialized = false;

    // текущие значения громкости
    this._currentIdleVolume = 0.8;
    this._currentMoveVolume = 0;
    this._SOUND_SMOOTHING_FACTOR = 0.05; // коэффициент сглаживания

    this._soundIds = {
      engineIdle: null,
      engineMove: null,
    };

    // первоначальная установка визуального состояния
    this.create();
  }

  // Запускает звуки двигателя танка
  _initSounds() {
    if (this._soundsInitialized || this._condition === 0) {
      return;
    }

    const soundOptions = {
      loop: true,
      x: this.x,
      y: this.y,
    };

    // звук движения (начало с нулевой громкости)
    const moveSoundOptions = { ...soundOptions, volume: 0 };

    this._soundIds.engineMove = this._soundManager.play(
      'tankEngine',
      moveSoundOptions,
    );

    // звук холостого хода (начало с нулевой громкости)
    const idleSoundOptions = { ...soundOptions, volume: 0 };
    this._soundIds.engineIdle = this._soundManager.play(
      'tankEngine',
      idleSoundOptions,
    );

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
      const speedRatio = Math.min(currentSpeed / this._maxSpeed, 1.0);

      // расчет целевой громкости
      const targetIdleVolume = 0.3 * (1 - speedRatio);
      const targetMoveVolume = 0.8 * speedRatio;

      // плавная интерполяция к целевой громкости
      this._currentIdleVolume = lerp(
        this._currentIdleVolume,
        targetIdleVolume,
        this._SOUND_SMOOTHING_FACTOR,
      );

      this._currentMoveVolume = lerp(
        this._currentMoveVolume,
        targetMoveVolume,
        this._SOUND_SMOOTHING_FACTOR,
      );

      const engineRate = 1.0 + speedRatio * 0.2;

      if (this._soundIds.engineIdle) {
        this._soundManager.updateSpatialSound(
          'tankEngine',
          this._soundIds.engineIdle,
          this.x,
          this.y,
          this._currentIdleVolume,
        );
      }

      if (this._soundIds.engineMove) {
        this._soundManager.updateSpatialSound(
          'tankEngine',
          this._soundIds.engineMove,
          this.x,
          this.y,
          this._currentMoveVolume,
        );
        this._soundManager.updateRate(
          'tankEngine',
          this._soundIds.engineMove,
          engineRate,
        );
      }
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
    if (this._soundsInitialized) {
      Object.keys(this._soundIds).forEach(key => {
        const soundId = this._soundIds[key];

        if (soundId) {
          this._soundManager.stopById('tankEngine', soundId);
          this._soundIds[key] = null;
        }
      });

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
