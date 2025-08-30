import { Howl, Howler } from 'howler';

/**
 * @class SoundManager
 * @description Управляет загрузкой, воспроизведением и остановкой звуков
 * с использованием Howler.js.
 */
export default class SoundManager {
  constructor() {
    Howler.autoUnlock = true; // разблокировка аудио при первом взаимодействии
    Howler.usingWebAudio = true;
    Howler.autoSuspend = false;
    Howler.volume(0.7); // начальная глобальная громкость

    // настройки пространственного звука
    this._defaultPannerSettings = {
      panningModel: 'HRTF', // модель панорамирования
      distanceModel: 'inverse', // модель затухания звука с расстоянием
      refDistance: 250, // расстояние (в px), на котором громкость равна 100%
      maxDistance: 2500, // расстояние, дальше которого звук не слышен
      rolloffFactor: 1, // коэффициент затухания (больше - быстрее затухает)
      coneInnerAngle: 360, // звук распространяется во все стороны одинаково
      coneOuterAngle: 0,
      coneOuterGain: 0,
    };

    // хранение загруженных звуков, ключ - имя звука, значение - экземпляр Howl
    this._sounds = new Map();

    // хранит соответствие soundId -> экземпляр Howl для активных звуков
    this._activeInstances = new Map();

    // позиция слушателя
    this._listenerX = 0;
    this._listenerY = 0;

    // хранит режим панорамирования ('centered' или 'spatial')
    // для каждого активного экземпляра звука (по soundId).
    // Это позволяет избежать конфликтов состояний в Web Audio API.
    this._soundModes = new Map();

    // радиус "личного пространства", в котором звуки не панорамируются,
    // а воспроизводятся по центру
    this._CENTERED_THRESHOLD = 10.0;

    this._registeredSounds = new Map();
  }

  /**
   * Асинхронно загружает все звуки, определенные в конфигурации.
   * @param {object} soundsConfig - Объект конфигурации звуков.
   * @param {string[]} soundsConfig.codecList - Список поддерживаемых кодеков.
   * @param {string} soundsConfig.path - Путь к директории со звуками.
   * @param {object} soundsConfig.sounds - Словарь, где ключ - имя звука,
   * значение - имя файла.
   * @returns {Promise<void>} Promise, разрешается после загрузки всех звуков.
   */
  async load(soundsConfig) {
    const { codecList, path, sounds } = soundsConfig;
    const supportedCodec = codecList.find(codec => Howler.codecs(codec));

    if (!supportedCodec) {
      console.error('No supported audio codec found from the list:', codecList);
      return;
    }

    const loadingPromises = Object.entries(sounds).map(
      ([soundName, fileName]) => {
        const url = `${path}${fileName}.${supportedCodec}`;
        return new Promise((resolve, reject) => {
          const soundInstance = new Howl({
            src: [url],
            preload: true,
            html5: false,
            onload: () => {
              this._sounds.set(soundName, soundInstance);
              resolve(soundName);
            },
            onloaderror: (_id, error) => {
              const errorMessage = `Error loading "${soundName}" from ${url}`;
              reject({ message: errorMessage, error });
            },
          });
        });
      },
    );

    // Promise.allSettled, чтобы сбой загрузки одного файла
    // не прерывал загрузку остальных
    const results = await Promise.allSettled(loadingPromises);

    results.forEach(result => {
      if (result.status === 'rejected') {
        console.error(result.reason.message, result.reason.error);
      }
    });
  }

  /**
   * Регистрирует звук, чтобы SoundManager сам обновлял его позицию/громкость.
   * @param {number} soundId - ID экземпляра
   * @param {function} getPosition - функция, возвращающая {x, y}
   * @param {function} getVolume - функция, возвращающая громкость (0..1)
   * @param {function} [getRate] - функция для обновления pitch (опционально)
   */
  registerSpatialSound(soundId, getPosition, getVolume, getRate) {
    if (!soundId) {
      return;
    }

    this._registeredSounds.set(soundId, {
      getPosition,
      getVolume,
      getRate,
    });
  }

  /**
   * Удаляет звук из списка зарегистрированных
   * @param {number} soundId - ID экземпляра
   */
  unregisterSpatialSound(soundId) {
    this._registeredSounds.delete(soundId);
    this._soundModes.delete(soundId);
  }

  /**
   * Централизованное обновление всех зарегистрированных звуков
   */
  updateAllSpatialSounds() {
    for (const [
      soundId,
      { getPosition, getVolume, getRate },
    ] of this._registeredSounds.entries()) {
      const sound = this._activeInstances.get(soundId);

      if (!sound) {
        continue;
      }

      const { x, y } = getPosition();
      const volume = getVolume();

      this._updateSpatialSound(sound, soundId, x, y, volume);

      if (getRate) {
        this._updateRate(sound, soundId, getRate());
      }
    }
  }

  /**
   * Устанавливает позицию слушателя (игрока) в 2D-пространстве.
   * @param {number} x - Координата X.
   * @param {number} y - Координата Y.
   */
  setListenerPosition(x, y) {
    this._listenerX = x;
    this._listenerY = y;
    // Корректное сопоставление координат для вида сверху:
    // Игровая Y-координата (глубина) -> Звуковая Z-координата
    // Звуковая Y-координата (высота) фиксируется на 0
    Howler.pos(x, 0, y);
  }

  /**
   * Устанавливает ориентацию (направление взгляда) слушателя.
   * Для 2D вида сверху ориентация всегда фиксирована - "вперед" к верху экрана.
   */
  setListenerOrientation() {
    // вектор "вперед" (0, 0, -1) - соответствует верху экрана
    // вектор "вверх" (0, 1, 0) - вектор "вверх" для аудиосистемы
    Howler.orientation(0, 0, -1, 0, 1, 0);
  }

  /**
   * Обновляет громкость и позицию/панораму пространственного звука.
   * При первом вызове определяет режим звука
   * (центрированный или пространственный)
   * и настраивает его один раз для избежания аудио-артефактов.
   * @param {string} sound - Звук.
   * @param {number} soundId - ID экземпляра.
   * @param {number} x - Координата X источника звука.
   * @param {number} y - Координата Y источника звука.
   * @param {number} baseVolume - Базовая громкость
   */
  _updateSpatialSound(sound, soundId, x, y, baseVolume = 0.7) {
    if (!sound || typeof soundId !== 'number') {
      return;
    }

    const distance = Math.hypot(x - this._listenerX, y - this._listenerY);

    // плавное затухание у границы
    const { maxDistance } = this._defaultPannerSettings;
    let finalVolume = baseVolume;

    if (distance >= maxDistance) {
      finalVolume = 0; // за пределами вообще не слышно
    } else {
      // чем ближе к maxDistance, тем слабее громкость
      const fadeFactor = 1 - distance / maxDistance;

      finalVolume *= Math.max(0, fadeFactor);
    }

    // "ленивая" инициализация режима (определяется только один раз)
    if (!this._soundModes.has(soundId)) {
      if (distance < this._CENTERED_THRESHOLD) {
        // режим для близких звуков (включая звук самого игрока)
        this._soundModes.set(soundId, 'centered');
        sound.stereo(0, soundId);
      } else {
        // режим для всех остальных звуков в мире
        this._soundModes.set(soundId, 'spatial');
        sound.pannerAttr(this._defaultPannerSettings, soundId);
      }
    }

    const mode = this._soundModes.get(soundId);

    if (mode === 'centered') {
      sound.volume(finalVolume, soundId);
    } else if (mode === 'spatial') {
      sound.pos(x, 0, y, soundId);
      sound.volume(finalVolume, soundId);
    }
  }

  /**
   * Обновляет скорость воспроизведения (pitch) для уже играющего звука.
   * @param {string} sound - Звук.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   * @param {number} rate - Новая скорость воспроизведения (1.0 - нормальная).
   */
  _updateRate(sound, soundId, rate) {
    if (sound && typeof soundId === 'number') {
      sound.rate(rate, soundId);
    }
  }

  /**
   * Воспроизводит звук по его имени.
   * @param {string} name - Имя звука (ключ из SoundDefinition).
   * @param {object} [options={}] - Опции воспроизведения.
   * @param {boolean} [options.loop=false] - Зациклить ли воспроизведение.
   * @param {number} [options.volume] - Громкость для этого экземпляра звука.
   * @param {function} [options.onend] - Callback по завершению звука.
   * @returns {number | null} ID воспроизводимого экземпляра звука или null.
   */
  play(name, options = {}) {
    const sound = this._sounds.get(name);

    if (!sound) {
      console.warn(`Attempting to play non-existent sound: "${name}"`);
      return null;
    }

    const soundId = sound.play();

    if (typeof soundId === 'number') {
      this._activeInstances.set(soundId, sound);
    }

    const { loop, volume, onend } = options;

    if (loop) {
      sound.loop(true, soundId);
    }

    if (typeof volume === 'number') {
      sound.volume(volume, soundId);
    }

    // когда звук заканчивает воспроизведение, удаление его из state-менеджера
    if (!loop) {
      sound.once(
        'end',
        () => {
          this.unregisterSpatialSound(soundId);
          this._activeInstances.delete(soundId);

          if (onend) {
            onend(soundId);
          }
        },
        soundId,
      );
    }

    return soundId;
  }

  /**
   * Воспроизводит звук один раз в указанной точке пространства.
   * Это обертка над play() и _updateSpatialSound() для удобства.
   * @param {string} name - Имя звука.
   * @param {object} options - Опции.
   * @param {number} options.x - Координата X.
   * @param {number} options.y - Координата Y.
   * @param {number} [options.volume=0.7] - Базовая громкость.
   * @param {function} [options.onend] - Callback по завершению звука.
   * @returns {number | null} ID экземпляра звука или null.
   */
  playSpatialOneShot(name, options) {
    const { x, y, volume = 0.7, onend } = options;

    const soundId = this.play(name, { onend });

    if (
      typeof soundId === 'number' &&
      typeof x === 'number' &&
      typeof y === 'number'
    ) {
      const sound = this._activeInstances.get(soundId);

      if (sound) {
        this._updateSpatialSound(sound, soundId, x, y, volume);
      }
    }

    return soundId;
  }

  /**
   * Останавливает конкретный экземпляр звука по его ID.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   */
  stopById(soundId) {
    const sound = this._activeInstances.get(soundId);

    if (sound && typeof soundId === 'number') {
      sound.stop(soundId);
      // явно очищается состояние при ручной остановке звука
      this._soundModes.delete(soundId);
      this._activeInstances.delete(soundId);
    }
  }

  /**
   * Выключает все звуки (mute).
   */
  mute() {
    Howler.mute(true);
  }

  /**
   * Включает все звуки после выключения.
   */
  unmute() {
    Howler.mute(false);
  }

  /**
   * Останавливает все играющие в данный момент звуки и сбрасывает их
   * состояние (режимы панорамирования, регистрацию).
   */
  reset() {
    // остановка всех звуков, которые сейчас играют
    Howler.stop();
    this._soundModes.clear();
    this._registeredSounds.clear();
    this._activeInstances.clear();
  }

  /**
   * Полностью выгружает все звуки из памяти и очищает внутренние состояния.
   */
  destroy() {
    Howler.unload();
    this._sounds.clear();
    this._soundModes.clear();
    this._registeredSounds.clear();
    this._activeInstances.clear();
  }
}
