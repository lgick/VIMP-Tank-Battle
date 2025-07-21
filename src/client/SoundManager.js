import { Howl, Howler } from 'howler';

/**
 * @const {object} SPATIAL_SETTINGS
 * @description централизованные настройки для пространственного 3D-звука
 */
const SPATIAL_SETTINGS = {
  // определяет алгоритм пространственного позиционирования
  // 'HRTF' - высококачественный, реалистичный 3D-звук (лучше всего в наушниках)
  // 'equalpower' - стандартное стереопанорамирование (лево-право)
  panningModel: 'HRTF',

  // определяет, как быстро затухает звук с расстоянием
  distanceModel: 'linear',

  // расстояние, на котором звук имеет 100% громкости
  // затухание начинается после
  refDistance: 500,

  // множитель "агрессивности" затухания
  // 1 - стандарт, >1 - быстрее, <1 - медленнее
  rolloffFactor: 1,

  // максимальное расстояние, на котором звук слышен
  maxDistance: 1500,
};

/**
 * @class SoundManager
 * @description управляет загрузкой,
 * воспроизведением (включая пространственное 3D)
 * и остановкой звуковых эффектов и музыки в игре
 */
export default class SoundManager {
  /**
   * @description инициализирует менеджер звуков,
   * внутреннее хранилище и устанавливает
   * глобальные настройки для Howler.js.
   */
  constructor() {
    this._sounds = new Map();
    this._listenerPos = { x: 0, y: 0 };

    Howler.autoUnlock = true;
    Howler.usingWebAudio = true;
    Howler.volume(0.7);
  }

  /**
   * @description обновляет позицию "слушателя" для корректной работы 3D-звука
   * @param {number} x - X-координата слушателя
   * @param {number} y - Y-координата слушателя (используется как Z-координата)
   * @returns {void}
   */
  setListenerPosition(x, y) {
    this._listenerPos.x = x;
    this._listenerPos.y = y;

    // глобальное обновление позиции "ушей" слушателя в 3D-мире Howler
    Howler.pos(x, y, 0);
  }

  /**
   * @description асинхронно загружает все звуковые ассеты
   * на основе конфигурационного файла
   * @param {object} soundsConfig - объект конфигурации звуков
   * @param {string[]} soundsConfig.codecList - массив поддерживаемых кодеков
   * ('webm', 'mp3')
   * @param {string} soundsConfig.path - путь к папке со звуковыми файлами
   * @param {Object.<string, string>} soundsConfig.sounds - словарь,
   * где ключ — имя звука, а значение — имя файла (без расширения)
   * @returns {Promise<void>}
   */
  async load(soundsConfig) {
    const { codecList, path, sounds } = soundsConfig;

    const supportedCodec = codecList.find(codec => Howler.codecs(codec));

    if (!supportedCodec) {
      return;
    }

    // создание массива промисов для параллельной загрузки всех звуков
    const loadingPromises = Object.entries(sounds).map(
      ([soundName, fileName]) =>
        new Promise((resolve, reject) => {
          const url = `${path}${fileName}.${supportedCodec}`;

          const soundInstance = new Howl({
            src: [url],
            preload: true,
            onload: () => {
              this._sounds.set(soundName, soundInstance);
              resolve();
            },
            onloaderror: (_id, error) => {
              console.error(
                `Error loading sound "${soundName}" from URL ${url}:`,
                error,
              );
              reject(error);
            },
          });
        }),
    );

    try {
      await Promise.all(loadingPromises);
    } catch (error) {
      console.error('Failed to load one or more sounds.', error);
    }
  }

  /**
   * @private
   * @description внутренний метод для воспроизведения пространственного звука
   * с использованием встроенной 3D-логики Howler
   * @param {Howl} soundInstance - экземпляр звука Howl для воспроизведения
   * @param {object} options - объект с координатами источника звука
   * @param {number} options.x - x-координата источника звука
   * @param {number} options.y - y-координата источника звука
   * (до применения затухания)
   * @returns {number|null} - id воспроизводимого звука или null,
   * если звук слишком далеко
   */
  _playSpatial(soundInstance, options) {
    const soundId = soundInstance.play();

    // расстояние для проверки maxDistance
    const dx = options.x - this._listenerPos.x;
    const dy = options.y - this._listenerPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // если звук слишком далеко, не требуется воспроизведение
    if (distance > SPATIAL_SETTINGS.maxDistance) {
      soundInstance.stop(soundId);
      return null;
    }

    // если звук в пределах видимости
    if (distance <= SPATIAL_SETTINGS.refDistance) {
      // обычное, не-пространственное воспроизведение
      soundInstance.play();
    } else {
      // применение 3D-настроек к этому конкретному звуку
      soundInstance.pannerAttr(SPATIAL_SETTINGS, soundId);

      // установка позиций источника звука в 3D-пространстве
      soundInstance.pos(options.x, options.y, 0, soundId);
    }

    return soundId;
  }

  /**
   * @description воспроизводит звук по его имени
   * если переданы координаты, как пространственные звуки
   * иначе, как обычные
   * @param {string} name - имя звука для воспроизведения (из конфигурации)
   * @param {object} [options={}] - необязательные параметры воспроизведения
   * @param {number} [options.x] - X-координата для пространственного звука
   * @param {number} [options.y] - Y-координата для пространственного звука
   * @returns {number|null} - id воспроизводимого звука
   * для последующего контроля, или null, если звук не найден
   */
  play(name, options = {}) {
    if (!this._sounds.has(name)) {
      return null;
    }

    const soundInstance = this._sounds.get(name);
    const isSpatial =
      typeof options.x === 'number' && typeof options.y === 'number';

    if (isSpatial) {
      return this._playSpatial(soundInstance, options);
    }

    // обычное, не-пространственное воспроизведение
    const soundId = soundInstance.play();

    return soundId;
  }

  /**
   * @description останавливает все экземпляры указанного звука
   * @param {string} name - имя звука для остановки
   * @returns {void}
   */
  stop(name) {
    if (!this._sounds.has(name)) {
      return;
    }

    this._sounds.get(name).stop();
  }

  /**
   * @description останавливает конкретный экземпляр звука по его id
   * @param {string} name - имя звука
   * @param {number} soundId - уникальный id экземпляра звука,
   * полученный при вызове `play`.
   * @returns {void}
   */
  stopById(name, soundId) {
    if (!this._sounds.has(name) || typeof soundId !== 'number') {
      return;
    }

    this._sounds.get(name).stop(soundId);
  }
}
