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
      refDistance: 100, // расстояние (в px), на котором громкость равна 100%
      maxDistance: 1500, // расстояние, дальше которого звук почти не слышен
      rolloffFactor: 1.5, // коэффициент затухания (больше - быстрее затухает)
      coneInnerAngle: 360, // звук распространяется во все стороны одинаково
      coneOuterAngle: 0,
      coneOuterGain: 0,
    };

    // хранение загруженных звуков, ключ - имя звука, значение - экземпляр Howl
    this._sounds = new Map();

    // позиция слушателя
    this._listenerX = 0;
    this._listenerY = 0;

    // радиус, в котором звук становится не пространственным
    this._SPATIAL_THRESHOLD = 200;

    // предварительно рассчитанная громкость
    // на границе порога для модели 'inverse'
    // Формула: ref / (ref + rolloff * (distance - ref))
    // 100 / (100 + 1.5 * (200 - 100)) = 100 / 250 = 0.4
    this._VOLUME_AT_THRESHOLD = 0.4;
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
              resolve();
            },
            onloaderror: (_id, error) => {
              const errorMessage = `Error loading "${soundName}" from ${url}`;

              console.error(errorMessage, error);
              reject(new Error(errorMessage));
            },
          });
        });
      },
    );

    try {
      await Promise.all(loadingPromises);
    } catch (error) {
      console.error('Failed to load one or more sounds.', error);
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
   * Обновляет позицию для простого пространственного звука
   * (без смешивания громкости).
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   * @param {number} x - Новая координата X.
   * @param {number} y - Новая координата Y.
   */
  updatePosition(name, soundId, x, y) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      sound.pos(x, 0, y, soundId);
    }
  }

  /**
   * Обновляет громкость, позицию и панорамирование звука
   * с учетом близости к слушателю.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра.
   * @param {number} x - Координата X источника звука.
   * @param {number} y - Координата Y источника звука.
   * @param {number} baseVolume - Базовая громкость (0-1),
   * рассчитанная игровой логикой (например, по скорости).
   */
  updateSpatialSound(name, soundId, x, y, baseVolume) {
    const sound = this._sounds.get(name);

    if (!sound || typeof soundId !== 'number') {
      return;
    }

    const distance = Math.hypot(x - this._listenerX, y - this._listenerY);

    if (distance <= this._SPATIAL_THRESHOLD) {
      // ближняя зона: центрированное стерео и ручная громкость
      sound.stereo(0, soundId);

      // рассчитываем множитель громкости
      // от 1 (в центре) до _VOLUME_AT_THRESHOLD (на границе)
      const proximity = 1 - distance / this._SPATIAL_THRESHOLD; // 0..1
      const volumeMultiplier =
        this._VOLUME_AT_THRESHOLD + (1 - this._VOLUME_AT_THRESHOLD) * proximity;
      const finalVolume = baseVolume * volumeMultiplier;

      sound.volume(finalVolume, soundId);
    } else {
      // дальняя зона: 3D-звук Howler
      sound.pannerAttr(this._defaultPannerSettings, soundId);
      sound.pos(x, 0, y, soundId);

      // базовая громкость, Howler сам рассчитает затухание
      sound.volume(baseVolume, soundId);
    }
  }

  /**
   * Обновляет скорость воспроизведения (pitch) для уже играющего звука.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   * @param {number} rate - Новая скорость воспроизведения (1.0 - нормальная).
   */
  updateRate(name, soundId, rate) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      sound.rate(rate, soundId);
    }
  }

  /**
   * Воспроизводит звук по его имени.
   * @param {string} name - Имя звука (ключ из SoundDefinition).
   * @param {object} [options={}] - Опции воспроизведения.
   * @param {number} [options.x] - Координата X для пространственного звука.
   * @param {number} [options.y] - Координата Y для пространственного звука.
   * @param {boolean} [options.loop=false] - Зациклить ли воспроизведение.
   * @param {number} [options.volume] - Громкость для этого экземпляра звука.
   * @returns {number | null} ID воспроизводимого экземпляра звука или null,
   * если звук не найден.
   */
  play(name, options = {}) {
    const sound = this._sounds.get(name);

    if (!sound) {
      console.warn(`Attempting to play non-existent sound: "${name}"`);
      return null;
    }

    const soundId = sound.play();
    const { x, y, loop, volume } = options;

    if (loop) {
      sound.loop(true, soundId);
    }

    if (typeof volume === 'number') {
      sound.volume(volume, soundId);
    }

    if (typeof x === 'number' && typeof y === 'number') {
      // для первого воспроизведения более простая логика,
      // т.к. updateSpatialSound будет вызван в следующем кадре.
      sound.pannerAttr(this._defaultPannerSettings, soundId);
      sound.pos(x, 0, y, soundId);
    }

    return soundId;
  }

  /**
   * Останавливает все экземпляры указанного звука.
   * @param {string} name - Имя звука, который нужно остановить.
   */
  stop(name) {
    const sound = this._sounds.get(name);

    if (sound) {
      sound.stop();
    }
  }

  /**
   * Останавливает конкретный экземпляр звука по его ID.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   */
  stopById(name, soundId) {
    const sound = this._sounds.get(name);

    if (sound && typeof soundId === 'number') {
      sound.stop(soundId);
    }
  }

  /**
   * Устанавливает глобальную громкость для всех звуков, управляемых Howler.
   * @param {number} volume - Значение громкости от 0.0 до 1.0.
   */
  setGlobalVolume(volume) {
    Howler.volume(volume);
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
   * Полностью выгружает все звуки из памяти
   * и останавливает внутренние процессы,
   * такие как keep-alive осциллятор.
   */
  destroy() {
    Howler.unload(); // выгрузка всех звуков
  }
}
