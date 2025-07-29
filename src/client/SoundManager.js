import { Howl, Howler } from 'howler';

/**
 * @class SoundManager
 * @description Управляет загрузкой, воспроизведением и остановкой звуков
 * с использованием Howler.js.
 */
export default class SoundManager {
  constructor() {
    // автоматически разблокирует аудиоконтекст
    // при первом взаимодействии пользователя
    Howler.autoUnlock = true;

    // web audio api для расширенных возможностей
    Howler.usingWebAudio = true;

    Howler.autoSuspend = false;

    // начальная глобальная громкость
    Howler.volume(0.7);

    // настройки по умолчанию для пространственного звука (3D-аудио)
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
  }

  /**
   * Асинхронно загружает все звуки, определенные в конфигурации.
   * @param {object} soundsConfig - Объект конфигурации звуков.
   * @param {string[]} soundsConfig.codecList - Список поддерживаемых кодеков.
   * @param {string} soundsConfig.path - Путь к директории со звуками.
   * @param {object} soundsConfig.sounds - Словарь, где ключ - имя звука, значение - имя файла.
   * @param {string} [soundsConfig.warmupSoundName] - Имя звука для "прогрева".
   * @returns {Promise<void>} Promise, который разрешается после загрузки всех звуков.
   */
  async load(soundsConfig) {
    const { codecList, path, sounds, warmupSoundName } = soundsConfig;

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
            html5: false, // Важно для использования Web Audio API и 3D-звука
            onload: () => {
              this._sounds.set(soundName, soundInstance);
              // console.log(`Sound "${soundName}" loaded successfully.`); // Можно раскомментировать для отладки
              resolve();
            },
            onloaderror: (_id, error) => {
              const errorMessage = `Error loading sound "${soundName}" from ${url}`;
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
    // Корректное сопоставление координат для вида сверху:
    // Игровая Y-координата (глубина) -> Звуковая Z-координата
    // Звуковая Y-координата (высота) фиксируется на 0
    Howler.pos(x, 0, y);
  }

  /**
   * Устанавливает ориентацию (направление взгляда) слушателя.
   * @param {number} angle - Угол в радианах, куда смотрит слушатель.
   */
  setListenerOrientation(angle) {
    const fx = Math.cos(angle); // Вектор направления "вперед" по X
    const fz = Math.sin(angle); // Вектор направления "вперед" по Z (соответствует Y в 2D)

    // Устанавливаем вектор "вперед" (fx, 0, fz) и вектор "вверх" (0, 1, 0)
    // для корректной ориентации в горизонтальной плоскости (вид сверху)
    Howler.orientation(fx, 0, fz, 0, 1, 0);
  }

  /**
   * Обновляет позицию для уже играющего пространственного звука.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра, полученный от метода play().
   * @param {number} x - Новая координата X.
   * @param {number} y - Новая координата Y.
   */
  updatePosition(name, soundId, x, y) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      // Так же, как в play(), сопоставляем 2D координаты с 3D аудио-пространством
      sound.pos(x, 0, y, soundId);
    }
  }

  /**
   * Воспроизводит звук по его имени.
   * @param {string} name - Имя звука (ключ из SoundDefinition).
   * @param {object} [options={}] - Опции воспроизведения.
   * @param {number} [options.x] - Координата X для пространственного звука.
   * @param {number} [options.y] - Координата Y для пространственного звука.
   * @param {boolean} [options.loop=false] - Зациклить ли воспроизведение.
   * @param {number} [options.volume] - Громкость для этого экземпляра звука (от 0.0 до 1.0).
   * @returns {number | null} ID воспроизводимого экземпляра звука или null, если звук не найден.
   */
  play(name, options = {}) {
    const sound = this._sounds.get(name);

    if (!sound) {
      console.warn(`Attempting to play non-existent sound: "${name}"`);
      return null;
    }

    // Воспроизводим звук и получаем его уникальный ID
    const soundId = sound.play();

    // Применяем опции к конкретному экземпляру звука
    const { x, y, loop, volume } = options;

    if (loop) {
      sound.loop(true, soundId);
    }
    if (typeof volume === 'number') {
      sound.volume(volume, soundId);
    }

    // Настраиваем 3D-звук, если переданы координаты
    if (typeof x === 'number' && typeof y === 'number') {
      sound.pannerAttr(this._defaultPannerSettings, soundId);
      // Корректное сопоставление координат для источника звука
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
   * Плавно изменяет громкость звука до указанного значения.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра звука.
   * @param {number} toVolume - Конечная громкость (от 0.0 до 1.0).
   * @param {number} duration - Длительность перехода в миллисекундах.
   */
  fade(name, soundId, toVolume, duration) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      // .volume() с ID вернет громкость конкретного экземпляра, если поддерживается;
      // иначе вернет общую громкость объекта Howl. Howler.js умен в этом.
      // ИСПРАВЛЕНО: .volume() без аргументов возвращает текущую общую громкость звука (число).
      const fromVolume = sound.volume();
      sound.fade(fromVolume, toVolume, duration, soundId);
    }
  }

  /**
   * Плавно останавливает звук, уменьшая его громкость до нуля, после чего останавливает воспроизведение.
   * @param {string} name - Имя звука.
   * @param {number} soundId - ID экземпляра звука.
   * @param {number} duration - Длительность затухания в миллисекундах.
   */
  fadeOutAndStop(name, soundId, duration) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      // ИСПРАВЛЕНО: .volume() без аргументов возвращает текущую общую громкость звука (число).
      const fromVolume = sound.volume();
      sound.fade(fromVolume, 0, duration, soundId);
      // Останавливаем звук после завершения затухания
      sound.once(
        'fade',
        id => {
          if (id === soundId) {
            sound.stop(id);
          }
        },
        soundId,
      );
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
   * Полностью выгружает все звуки из памяти и останавливает внутренние процессы,
   * такие как keep-alive осциллятор. Следует вызывать при уничтожении игрового инстанса.
   */
  destroy() {
    Howler.unload(); // выгрузка всех звуков
  }
}
