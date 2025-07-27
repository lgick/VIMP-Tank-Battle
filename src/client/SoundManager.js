import { Howl, Howler } from 'howler';

/**
 * @class SoundManager
 * @description Управляет загрузкой, воспроизведением и остановкой звуков с использованием Howler.js.
 * Поддерживает глобальные настройки и позиционирование звука в 2D-пространстве.
 */
export default class SoundManager {
  /**
   * Хранилище загруженных экземпляров Howl.
   * @private
   * @type {Map<string, Howl>}
   */
  _sounds = new Map();

  /**
   * Настройки по умолчанию для пространственного звука.
   * @private
   * @readonly
   */
  _defaultPannerSettings;

  /**
   * Имя звука, указанное в конфигурации для "прогрева" AudioContext.
   * @private
   * @type {string | null}
   */
  _warmupSoundName = null;

  /**
   * @constructor
   */
  constructor() {
    // Глобальные настройки для Howler
    Howler.autoUnlock = true; // Автоматически разблокирует аудиоконтекст при первом взаимодействии пользователя
    Howler.usingWebAudio = true; // Предпочитаем Web Audio API для расширенных возможностей
    Howler.volume(0.7); // Устанавливаем начальную глобальную громкость

    // Настройки для пространственного звука (3D-аудио)
    this._defaultPannerSettings = {
      panningModel: 'HRTF', // Более качественная модель панорамирования
      distanceModel: 'inverse', // Модель затухания звука с расстоянием
      refDistance: 100, // Расстояние (в px), на котором громкость равна 100%
      maxDistance: 1500, // Максимальное расстояние, дальше которого звук почти не слышен
      rolloffFactor: 1.5, // Коэффициент затухания (чем больше, тем быстрее затухает)
      coneInnerAngle: 360, // Звук распространяется во все стороны одинаково
      coneOuterAngle: 0,
      coneOuterGain: 0,
    };

    this._handleVisibilityChange = this._handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this._handleVisibilityChange);

    // привязка и добавление слушателя для "пробуждения" аудиоконтекста
    // при нажатии клавиш
    this._resumeAudioContext = this._resumeAudioContext.bind(this);
    document.addEventListener('keydown', this._resumeAudioContext, true);
  }

  // Новый приватный метод
  _handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      this.mute(); // Или Howler.volume(0.1) для тихого фона
    } else {
      this.unmute();
    }
  }

  // проверяет и возобновляет AudioContext, если он был приостановлен браузером
  _resumeAudioContext() {
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx
        .resume()
        .then(() => {
          // после успешного возобновления, проигрывается очень тихий звук,
          // чтобы "прогреть" аудио-движок safari
          if (this._warmupSoundName) {
            this.play(this._warmupSoundName, { volume: 0.001, loop: false });
          }
        })
        .catch(e => console.error('Не удалось возобновить аудиоконтекст:', e));
    }
  }

  /**
   * Асинхронно загружает все звуки, определенные в конфигурации.
   * @param {SoundConfig} soundsConfig - Объект конфигурации звуков.
   * @returns {Promise<void>} Promise, который разрешается после загрузки всех звуков.
   */
  async load(soundsConfig) {
    const { codecList, path, sounds, warmupSoundName } = soundsConfig;
    this._warmupSoundName = warmupSoundName;

    const supportedCodec = codecList.find(codec => Howler.codecs(codec));

    if (!supportedCodec) {
      console.error(
        'Не найден поддерживаемый аудиокодек из списка:',
        codecList,
      );
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
              // console.log(`Звук "${soundName}" успешно загружен.`); // Можно раскомментировать для отладки
              resolve();
            },
            onloaderror: (_id, error) => {
              const errorMessage = `Ошибка загрузки звука "${soundName}" из ${url}`;
              console.error(errorMessage, error);
              reject(new Error(errorMessage));
            },
          });
        });
      },
    );

    try {
      await Promise.all(loadingPromises);
      console.log('Все звуки успешно загружены.');
    } catch (error) {
      console.error('Не удалось загрузить один или несколько звуков.', error);
    }
  }

  /**
   * Устанавливает позицию слушателя в 2D-пространстве.
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
   * @param {number} angle - Угол в радианах.
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
   * @param {PlayOptions} [options={}] - Опции воспроизведения.
   * @returns {number | null} ID воспроизводимого экземпляра звука или null, если звук не найден.
   */
  play(name, options = {}) {
    const sound = this._sounds.get(name);
    if (!sound) {
      console.warn(`Попытка воспроизвести несуществующий звук: "${name}"`);
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
   * @param {string} name - Имя звука.
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
   * @param {number} toVolume - Конечная громкость (0.0 до 1.0).
   * @param {number} duration - Длительность перехода в миллисекундах.
   */
  fade(name, soundId, toVolume, duration) {
    const sound = this._sounds.get(name);
    if (sound && typeof soundId === 'number') {
      // ИСПРАВЛЕНО: .volume() без аргументов возвращает текущую общую громкость звука (число).
      const fromVolume = sound.volume();
      sound.fade(fromVolume, toVolume, duration, soundId);
    }
  }

  /**
   * Плавно останавливает звук, уменьшая его громкость до нуля.
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
   * Устанавливает глобальную громкость для всех звуков.
   * @param {number} volume - Значение громкости от 0.0 до 1.0.
   */
  setGlobalVolume(volume) {
    Howler.volume(volume);
  }

  /**
   * Выключает все звуки.
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

  // Также неплохо было бы добавить метод для очистки при уничтожении менеджера
  destroy() {
    document.removeEventListener(
      'visibilitychange',
      this._handleVisibilityChange,
    );

    document.removeEventListener('keydown', this._resumeAudioContext, true);

    Howler.unload(); // Выгружает все звуки
  }
}
