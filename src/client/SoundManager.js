import { Howl, Howler } from 'howler';

/**
 * @class SoundManager
 * @description управляет загрузкой,
 * воспроизведением и остановкой звуковых эффектов и музыки в игре
 */
export default class SoundManager {
  constructor() {
    this._sounds = new Map();
    this._listenerPos = { x: 0, y: 0 };
    this._listenerAngle = 0; // направление "взора" в радианах

    Howler.autoUnlock = true;
    Howler.usingWebAudio = true;
    Howler.volume(0.7);
  }

  /**
   * @description обновляет позицию "слушателя" для корректной работы 3D-звука
   * @param {number} x - X-координата слушателя
   * @param {number} y - Y-координата слушателя
   * @returns {void}
   */
  setListenerPosition(x, y) {
    this._listenerPos.x = x;
    this._listenerPos.y = y;
    Howler.pos(x, y, 0);
  }

  /**
   * @description обновляет угол направления "взора" слушателя
   * @param {number} angle - угол в радианах (0 — вправо, PI/2 — вверх)
   */
  setListenerOrientation(angle) {
    this._listenerAngle = angle;

    // ориентация слушателя для WebAudio Panner
    const fx = Math.cos(angle);
    const fy = Math.sin(angle);

    Howler.orientation(fx, fy, 0, 0, 0, 1);
  }

  /**
   * @description асинхронно загружает все звуковые ассеты
   * @param {object} soundsConfig - объект конфигурации звуков
   */
  async load(soundsConfig) {
    const { codecList, path, sounds } = soundsConfig;
    const supportedCodec = codecList.find(codec => Howler.codecs(codec));

    if (!supportedCodec) {
      return;
    }

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
   * @description воспроизводит звук по имени с учётом панорамы и затухания
   * @param {string} name - имя звука
   * @param {object} options - { x, y, maxDistance }
   * @returns {number|null} id экземпляра звука
   */
  play(name, options = {}) {
    const sound = this._sounds.get(name);

    if (!sound) {
      return null;
    }

    const soundId = sound.play();
    const { x, y, maxDistance = 1000 } = options;

    if (typeof x === 'number' && typeof y === 'number') {
      // вектор от слушателя к источнику
      const dx = x - this._listenerPos.x;
      const dy = y - this._listenerPos.y;
      const dist = Math.hypot(dx, dy);

      // затухание (линейная)
      const attenuation = Math.max(0, 1 - dist / maxDistance);
      sound.volume(attenuation, soundId);

      // панорама
      const theta = Math.atan2(dy, dx) - this._listenerAngle;
      const pan = Math.sin(theta);
      sound.stereo(pan, soundId);
    }

    return soundId;
  }

  /**
   * @description останавливает все экземпляры указанного звука
   * @param {string} name - имя звука
   */
  stop(name) {
    const sound = this._sounds.get(name);

    if (sound) {
      sound.stop();
    }
  }

  /**
   * @description останавливает конкретный экземпляр звука по id
   * @param {string} name - имя звука
   * @param {number} soundId - id экземпляра
   */
  stopById(name, soundId) {
    const sound = this._sounds.get(name);

    if (sound && typeof soundId === 'number') {
      sound.stop(soundId);
    }
  }
}
