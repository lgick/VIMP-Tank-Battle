import { Howl, Howler } from 'howler';

/**
 * @class SoundManager
 * @description Централизованный "режиссёр звука". Управляет загрузкой,
 * виртуализацией и воспроизведением всех звуков в игре. Использует систему
 * приоритетов и глобальный лимит голосов для предотвращения перегрузки
 * аудио-движка и обеспечения того, чтобы самые важные звуки всегда были слышны.
 */
export default class SoundManager {
  constructor() {
    Howler.autoUnlock = true; // разблокировка аудио при первом взаимодействии
    Howler.usingWebAudio = true;
    Howler.autoSuspend = false;
    Howler.volume(0.7); // начальная глобальная громкость
    Howler.pos(0, 0, 0);

    // устанавливает ориентацию (направление взгляда) слушателя.
    // вектор "вперед" (0, 0, -1) - соответствует верху экрана
    // вектор "вверх" (0, 1, 0) - вектор "вверх" для аудиосистемы
    Howler.orientation(0, 0, -1, 0, 1, 0);

    // настройки пространственного звука
    this._defaultPannerSettings = {
      panningModel: 'HRTF', // модель панорамирования
      distanceModel: 'inverse', // модель затухания звука с расстоянием
      refDistance: 100, // расстояние (в px), на котором громкость равна 100%
      maxDistance: 1000, // расстояние, дальше которого звук не слышен
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

    // глобальный лимит звуков
    this.WORLD_VOICE_LIMIT = 30;

    // реестр постоянных звуков (loop's)
    // Map<id, { soundName, position, soundId, type, ... }>
    this._persistentSounds = new Map();

    // очередь одноразовых звуков, заявленных в этом кадре
    this._oneShotQueue = [];

    // минимальная дистанция для панорамирования
    this.MIN_SPATIAL_DISTANCE = 1.0;
  }

  /**
   * Асинхронно загружает все звуки, определенные в конфигурации.
   * Сохраняет как сам экземпляр Howl, так и его конфигурацию (приоритет и т.д.).
   * @param {object} soundsConfig - Объект конфигурации звуков.
   * @param {string[]} soundsConfig.codecList - Список поддерживаемых кодеков (например, ['webm', 'mp3']).
   * @param {string} soundsConfig.path - Путь к директории со звуками.
   * @param {object} soundsConfig.sounds - Словарь, где ключ - имя звука,
   * а значение - объект конфигурации { file, priority }.
   * @returns {Promise<void>} Promise, который разрешается после загрузки всех звуков.
   */
  async load(soundsConfig) {
    const { codecList, path, sounds } = soundsConfig;
    const supportedCodec = codecList.find(codec => Howler.codecs(codec));

    if (!supportedCodec) {
      console.error('No supported audio codec found from the list:', codecList);
      return;
    }

    const loadingPromises = Object.entries(sounds).map(
      ([soundName, soundData]) => {
        const fileName =
          typeof soundData === 'string' ? soundData : soundData.file;

        const url = `${path}${fileName}.${supportedCodec}`;

        return new Promise((resolve, reject) => {
          const soundInstance = new Howl({
            src: [url],
            preload: true,
            html5: false,
            onload: () => {
              this._sounds.set(soundName, {
                howl: soundInstance.pannerAttr(this._defaultPannerSettings),
                config: soundData,
              });
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
   * Устанавливает позицию слушателя (игрока) в 2D-пространстве для
   * корректного расчета 3D-звука.
   * @param {number} x - Координата X слушателя.
   * @param {number} y - Координата Y слушателя.
   */
  setListenerPosition(x, y) {
    this._listenerX = x;
    this._listenerY = y;
  }

  /**
   * Воспроизводит системный/UI звук немедленно, в обход системы приоритетов.
   * Следует использовать для критически важных звуков, не относящихся к
   * игровому миру (например, клики в меню, звук начала раунда).
   * @param {string} soundName - Имя звука для воспроизведения.
   */
  playSystemSound(soundName) {
    const soundData = this._sounds.get(soundName);

    if (soundData) {
      soundData.howl.play();
    }
  }

  /**
   * Подает заявку на воспроизведение одноразового пространственного звука.
   * Возвращает уникальный ID заявки для возможной отмены. Звук не играется
   * немедленно, а попадает в очередь на рассмотрение "режиссёром".
   * @param {string} soundName - Имя звука (ключ из файла sounds.js).
   * @param {object} position - Координаты источника звука в мире, формат: { x: number, y: number }.
   * @param {object} [options={}] - Дополнительные опции для звука (volume, onend, isPersonal).
   * @returns {Symbol | null} Уникальный ID заявки или `null`, если звук не найден.
   */
  requestOneShot(soundName, position, options = {}) {
    // 1. Проверка существования звука.
    // Это важный шаг, чтобы избежать ошибок, если будет запрошен несуществующий
    // или неправильно названный звук. Мы ищем его в нашей карте `_sounds`.
    const soundData = this._sounds.get(soundName);

    if (!soundData) {
      // Выводим предупреждение в консоль для помощи в отладке,
      // но не прерываем выполнение игры.
      console.warn(
        `SoundManager: Попытка запросить несуществующий звук "${soundName}". Заявка отклонена.`,
      );
      return null;
    }

    // 2. Создание уникального идентификатора для заявки.
    // Symbol гарантирует, что этот ID никогда не будет конфликтовать с другими,
    // даже если несколько звуков будут запрошены в один и тот же момент времени.
    const requestId = Symbol(`oneShot_${soundName}`);

    // 3. Создание объекта заявки и добавление его в очередь.
    // Объект содержит всю необходимую "режиссёру" информацию для принятия решения.
    this._oneShotQueue.push({
      id: requestId, // Уникальный ID этой конкретной заявки
      soundName, // Имя звука для поиска в `_sounds`
      position, // Позиция в мире для расчета приоритета
      options, // Дополнительные параметры (громкость, onend и т.д.)
      type: 'one-shot', // Тип, чтобы "режиссёр" знал, что это одноразовый звук
    });

    // 4. Возвращаем ID вызывающему коду.
    // Это позволяет объекту (например, ShotEffectController) сохранить этот ID
    // и, при необходимости, отменить свою заявку позже.
    return requestId;
  }

  /**
   * Отменяет заявку на воспроизведение одноразового звука.
   * Эффективно работает как для звуков, которые еще в очереди, так и для тех,
   * что уже начали проигрываться.
   * @param {Symbol | null} requestId - Уникальный ID, полученный от `requestOneShot`.
   */
  cancelOneShot(requestId) {
    if (!requestId) {
      return;
    }

    // 1. Попробовать найти и удалить из очереди ожидания (самый частый случай)
    const queueIndex = this._oneShotQueue.findIndex(
      req => req.id === requestId,
    );

    if (queueIndex !== -1) {
      this._oneShotQueue.splice(queueIndex, 1);
      return;
    }

    // 2. Если в очереди нет, значит звук, возможно, уже играет. Ищем его в активных.
    for (const [soundId, instanceData] of this._activeInstances.entries()) {
      if (instanceData.requestId === requestId) {
        this._internalStop(soundId);
        break; // Нашли и остановили, выходим из цикла
      }
    }
  }

  /**
   * Регистрирует постоянный, зацикленный источник звука (например, двигатель танка).
   * Сообщает "режиссёру" о существовании этого звука, чтобы он мог быть включен
   * в общий конкурс за право быть услышанным.
   * @param {Symbol} id - Уникальный идентификатор объекта-владельца звука.
   * @param {string} soundName - Имя звука.
   * @param {function} getPosition - Функция, возвращающая актуальные координаты {x, y}.
   * @param {function} getVolume - Функция, возвращающая базовую громкость звука.
   * @param {function} [getRate] - Опциональная функция, возвращающая высоту тона.
   */
  registerPersistentSound(id, soundName, getPosition, getVolume, getRate) {
    if (this._persistentSounds.has(id)) {
      return;
    }

    this._persistentSounds.set(id, {
      id,
      soundName,
      getPosition,
      getVolume,
      getRate,
      activeSoundId: null,
      type: 'persistent',
    });
  }

  /**
   * Снимает с регистрации постоянный источник звука.
   * Если звук в данный момент проигрывается, он будет немедленно остановлен.
   * @param {Symbol} id - Уникальный идентификатор объекта-владельца.
   */
  unregisterPersistentSound(id) {
    const soundData = this._persistentSounds.get(id);

    if (soundData && soundData.activeSoundId !== null) {
      this._internalStop(soundData.activeSoundId);
    }

    this._persistentSounds.delete(id);
  }

  /**
   * Главный метод-"режиссёр", мозг всей звуковой системы.
   * Вызывается один раз за кадр. Анализирует все существующие и заявленные
   * звуки (как постоянные, так и одноразовые), пересчитывает их важность
   * на основе приоритета и расстояния, и решает, какие из них должны
   * звучать в данный момент, соблюдая глобальный лимит голосов.
   */
  processAudibility() {
    // 1. --- СБОР ВСЕХ КАНДИДАТОВ (НОВЫХ И СТАРЫХ) ---
    const candidates = [];

    // --- ШАГ 1А: Добавляем НОВЫЕ заявки (one-shot и persistent) ---
    for (const [id, sound] of this._persistentSounds.entries()) {
      if (sound.activeSoundId === null) {
        // Только те, что еще не играют
        candidates.push({ ...sound, position: sound.getPosition() });
      }
    }

    candidates.push(...this._oneShotQueue);
    this._oneShotQueue = [];

    // --- ШАГ 1Б: Добавляем УЖЕ ИГРАЮЩИЕ звуки в общий конкурс ---
    // Они тоже должны бороться за право продолжать играть
    for (const [soundId, instance] of this._activeInstances.entries()) {
      let position;

      if (instance.type === 'persistent') {
        // Для моторов берем актуальную позицию
        position = this._persistentSounds.get(instance.ownerId)?.getPosition();
      } else {
        // Для one-shot звуков позиция статична и хранится в самом инстансе
        position = instance.position;
      }

      // Если позицию определить не удалось, пропускаем
      if (!position) {
        continue;
      }

      candidates.push({
        id: instance.ownerId,
        soundName: instance.name,
        type: instance.type,
        position,
        options: instance.options,
        isPlaying: true, // кандидат уже активен
        soundId,
      });
    }

    if (candidates.length === 0) {
      return;
    }

    // 2. --- РАСЧЕТ РЕЙТИНГА ДЛЯ ВСЕХ ---
    // Этот блок остается почти без изменений
    for (const candidate of candidates) {
      if (candidate.options && candidate.options.isPersonal) {
        candidate.priorityScore = 99999;
        continue;
      }
      const distance =
        Math.hypot(
          candidate.position.x - this._listenerX,
          candidate.position.y - this._listenerY,
        ) || 0.1;
      const soundData = this._sounds.get(candidate.soundName);
      if (!soundData) {
        candidate.priorityScore = 0;
        continue;
      }
      const soundConfig = soundData.config;
      const basePriority = soundConfig.priority || 50;
      candidate.priorityScore = basePriority / distance;
    }

    // 3. --- ВЫБОР ЛУЧШИХ N (ГЛОБАЛЬНЫЙ ТОП) ---
    candidates.sort((a, b) => b.priorityScore - a.priorityScore);
    const audibleCandidates = candidates.slice(0, this.WORLD_VOICE_LIMIT);
    const audibleSet = new Set(audibleCandidates);

    // 4. --- СИНХРОНИЗАЦИЯ: ОСТАНОВКА И ЗАПУСК ---
    // Теперь логика становится проще. Проходим по всем кандидатам (и старым, и новым).
    for (const candidate of candidates) {
      const shouldBePlaying = audibleSet.has(candidate);

      if (candidate.isPlaying) {
        // --- Сценарий 1: Звук играет, но больше НЕ должен -> ОСТАНОВКА ---
        if (!shouldBePlaying) {
          this._internalStop(candidate.soundId);
          // Если это был persistent, обновляем его статус
          if (candidate.type === 'persistent') {
            const sound = this._persistentSounds.get(candidate.id);

            if (sound) {
              sound.activeSoundId = null;
            }
          }
        }
      } else {
        // --- Сценарий 2: Звук НЕ играет, но ДОЛЖЕН -> ЗАПУСК ---
        if (shouldBePlaying) {
          if (candidate.type === 'one-shot') {
            const soundId = this._internalPlay(candidate);
            if (soundId !== null) {
              // Сохраняем позицию, чтобы в след. кадре переоценить этот звук
              this._activeInstances.get(soundId).position = candidate.position;
              this._activeInstances.get(soundId).options = candidate.options;

              const soundHowl = this._activeInstances.get(soundId)?.sound;
              this._updateSpatialSound(
                soundHowl,
                soundId,
                candidate.position.x,
                candidate.position.y,
                candidate.options.volume,
              );
            }
          } else if (candidate.type === 'persistent') {
            const sound = this._persistentSounds.get(candidate.id);
            if (sound) {
              // sound.activeSoundId здесь гарантированно null
              sound.activeSoundId = this._internalPlay({
                ...candidate,
                options: { loop: true, volume: 0 },
              });
            }
          }
        }
      }
    }
  }

  /**
   * Централизованно обновляет параметры (громкость, панорама, высота тона)
   * для всех постоянных звуков, которые в данный момент активны.
   * Вызывается каждый кадр после `processAudibility`.
   */
  updatePersistentSounds() {
    // 1. Итерируемся по нашему новому реестру постоянных звуков.
    for (const persistentSound of this._persistentSounds.values()) {
      // 2. Проверяем, активен ли этот звук в данный момент.
      // Если "режиссёр" решил его не воспроизводить, activeSoundId будет null.
      const soundId = persistentSound.activeSoundId;
      if (soundId === null) {
        continue;
      }

      // 3. Получаем реальный экземпляр Howl из карты активных звуков.
      const instanceData = this._activeInstances.get(soundId);
      if (!instanceData) {
        continue; // Защита на случай рассинхронизации.
      }
      const howl = instanceData.sound;

      // 4. Используем getter'ы, сохраненные при регистрации, чтобы получить актуальные данные.
      const { x, y } = persistentSound.getPosition();
      const volume = persistentSound.getVolume();

      // 5. Вызываем низкоуровневый метод для обновления пространственного звука.
      this._updateSpatialSound(howl, soundId, x, y, volume);

      // 6. Обновляем высоту тона, если эта функция была предоставлена.
      if (persistentSound.getRate) {
        const rate = persistentSound.getRate();
        this._updateRate(howl, soundId, rate);
      }
    }
  }

  /**
   * Внутренний метод-"исполнитель" для воспроизведения звука через Howler.
   * Вызывается только "режиссёром" (processAudibility) для одобренных звуков.
   * @private
   * @param {object} candidate - Объект-кандидат на воспроизведение.
   * @returns {number | null} ID экземпляра звука от Howler.js или null.
   */
  _internalPlay(candidate) {
    const { soundName, options, id, type } = candidate;

    const soundData = this._sounds.get(soundName);

    if (!soundData) {
      console.warn(
        `SoundManager: _internalPlay не смог найти звук "${soundName}".`,
      );

      return null;
    }

    const sound = soundData.howl;
    const soundId = sound.play();

    if (typeof soundId !== 'number') {
      console.error(
        `SoundManager: Howler не смог воспроизвести звук "${soundName}".`,
      );

      return null;
    }

    // регистрация активного экземпляра
    this._activeInstances.set(soundId, {
      sound, // объект Howl
      name: soundName, // имя звука
      type, // тип ('one-shot' или 'persistent')
      ownerId: id, // уникальный ID (Symbol)
    });

    if (options) {
      // установка зацикливания (важно для 'persistent' звуков)
      if (options.loop) {
        sound.loop(true, soundId);
      }

      // установка начальной громкости
      if (typeof options.volume === 'number') {
        sound.volume(options.volume, soundId);
      }
    }

    // установка логики самоуничтожения для одноразовых звуков
    if (type === 'one-shot' && !(options && options.loop)) {
      const onEndCallback = () => {
        // запуск пользовательского колбэка, если он был предоставлен
        if (options && typeof options.onend === 'function') {
          options.onend();
        }

        // удаление звука из внутреннего реестра активных звуков
        this._activeInstances.delete(soundId);
      };

      sound.once('end', onEndCallback, soundId);
    }

    return soundId;
  }

  /**
   * Внутренний метод для немедленной остановки конкретного экземпляра звука.
   * @private
   * @param {number} soundId - ID экземпляра звука от Howler.js.
   */
  _internalStop(soundId) {
    const instanceData = this._activeInstances.get(soundId);

    if (instanceData) {
      instanceData.sound.stop(soundId);
      this._activeInstances.delete(soundId);
    }
  }

  /**
   * Обновляет громкость и 3D-позицию/панораму.
   * @private
   * @param {Howl} sound - Экземпляр Howl.
   * @param {number} soundId - ID конкретного проигрываемого звука.
   * @param {number} x - Координата X источника звука.
   * @param {number} y - Координата Y источника звука.
   * @param {number} [baseVolume=0.7] - Базовая громкость.
   */
  _updateSpatialSound(sound, soundId, x, y, baseVolume = 0.7) {
    if (!sound || typeof soundId !== 'number') {
      return;
    }

    const distance = Math.hypot(x - this._listenerX, y - this._listenerY);

    if (distance >= this._defaultPannerSettings.maxDistance) {
      sound.volume(0, soundId);
    } else {
      sound.volume(baseVolume, soundId);
    }

    if (distance > this.MIN_SPATIAL_DISTANCE) {
      sound.pos(x - this._listenerX, 0, y - this._listenerY, soundId);
    } else {
      sound.pos(0, 0, 0, soundId);
    }
  }

  /**
   * Обновляет скорость воспроизведения (pitch/rate) для играющего звука.
   * @private
   * @param {Howl} sound - Экземпляр Howl.
   * @param {number} soundId - ID конкретного проигрываемого звука.
   * @param {number} rate - Новая скорость воспроизведения (1.0 - нормальная).
   */
  _updateRate(sound, soundId, rate) {
    if (sound && typeof soundId === 'number') {
      sound.rate(rate, soundId);
    }
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

  /**
   * Останавливает все играющие звуки и сбрасывает внутреннее состояние "режиссёра".
   * Используется при смене карты или полной перезагрузке.
   */
  reset() {
    // остановка всех звуков, которые сейчас играют
    Howler.stop();
    this._activeInstances.clear();
  }

  /**
   * Полностью выгружает все загруженные звуки из памяти.
   * Следует вызывать при закрытии вкладки или полном завершении работы приложения.
   */
  destroy() {
    Howler.unload();
    this._sounds.clear();
    this._activeInstances.clear();
  }
}
