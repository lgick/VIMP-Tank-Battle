import { Container, Sprite } from 'pixi.js';
import { lerp, clamp } from '../../lib/math.js';

// скорость (высота тона) на холостом ходу
const MIN_ENGINE_RATE = 1;

// скорость при движении
const MAX_ENGINE_RATE = 1.15;

// повышенная скорость при напряжении (газ в стену)
const STRAIN_ENGINE_RATE = 1.25;

// множитель громкости на холостом ходу (60% от базовой)
const MIN_ENGINE_VOLUME_FACTOR = 0.6;

// множитель на полном ходу (100% от базовой)
const MAX_ENGINE_VOLUME_FACTOR = 1.0;

// глубина и частота покачивания питча на холостом ходу
const IDLE_WOBBLE_DEPTH = 0.015;
const IDLE_WOBBLE_HZ = 2.5;

/**
 * Вычисляет параметры звука двигателя на основе нагрузки на двигатель.
 * @param {number} load - Нагрузка на двигатель (от 0.0 до > 1.0).
 * @param {number} [timeMs] - Время для покачивания питча на холостых.
 * @returns {{rate: number, volumeFactor: number}} -
 * Объект со скоростью (pitch) и множителем громкости.
 */
export function calculateEngineSoundParams(load, timeMs = 0) {
  // load 0.0 -> холостой ход
  // load 1.0 -> движение на полной скорости
  // load > 1.0 -> напряжение (газ в стену)

  // интерполяция скорости (pitch) и громкости,
  // разделение базовой нагрузки (до 1.0)
  // и нагрузки от напряжения (свыше 1.0).
  const safeLoad = Number.isFinite(load) ? load : 0;
  const baseLoad = clamp(safeLoad, 0, 1);
  const strainLoad = Math.max(0, safeLoad - 1.0);

  const rate =
    lerp(MIN_ENGINE_RATE, MAX_ENGINE_RATE, baseLoad) +
    (STRAIN_ENGINE_RATE - MAX_ENGINE_RATE) * strainLoad;

  const volumeFactor = lerp(
    MIN_ENGINE_VOLUME_FACTOR,
    MAX_ENGINE_VOLUME_FACTOR,
    baseLoad,
  );

  // Неизменная высота тона у баса читается ухом как гул, а не как двигатель:
  // на холостых питч слегка покачивается, с ростом нагрузки покачивание
  // сходит на нет — там за характер отвечает сама нагрузка.
  const wobble =
    1 +
    IDLE_WOBBLE_DEPTH *
      (1 - baseLoad) *
      Math.sin(2 * Math.PI * IDLE_WOBBLE_HZ * (timeMs / 1000));

  return { rate: rate * wobble, volumeFactor };
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
    // [x, y, rotation, gunRotation, vX, vY,
    // engineLoad, condition, size, teamId]
    this.x = data[0] || 0;
    this.y = data[1] || 0;
    this.rotation = data[2] || 0;
    this.gun.rotation = data[3] || 0;
    this._engineLoad = data[6] || 0;
    this._condition = data[7];
    this._size = data[8];
    this._teamId = data[9];

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

    const engineConfig = this._soundManager.getSoundConfig('tankEngine') || {};
    this._baseEngineVolume = engineConfig.volume || 0;

    // первоначальная установка визуального состояния
    this.create();
  }

  // запускает звуки двигателя танка
  _initSounds() {
    if (this._soundId || this._condition === 0) {
      return;
    }

    this._soundId = this._soundManager.registerSound(
      'tankEngine',
      this._getSoundData(),
    );
  }

  _getSoundData() {
    const { rate, volumeFactor } = calculateEngineSoundParams(
      this._engineLoad,
      performance.now(),
    );

    return {
      position: { x: this.x, y: this.y },
      rate,
      volume: this._baseEngineVolume * volumeFactor,
    };
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

      // при уничтожении отключение звука
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
    this._engineLoad = data[6] || 0;

    // обновление звуковой логики
    if (this._soundId && this._condition > 0) {
      // Регистрация могла быть снята SoundManager.reset() — перерегистрируемся.
      // Опирается на инвариант: loop-звуки из реестра не вытесняются
      // (ни по дистанции, ни по лимиту голосов), иначе будет
      // перерегистрация каждый кадр. Инвариант закреплён тестом
      // «далёкий loop-звук остаётся в реестре».
      const alive = this._soundManager.updateSoundData(
        this._soundId,
        this._getSoundData(),
      );

      if (!alive) {
        this._soundId = null;
        this._initSounds();
      }
    }

    const newCondition = data[7];
    const teamId = data[9];

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
    if (this._soundId) {
      this._soundManager.unregisterSound(this._soundId);
      this._soundId = null;
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
