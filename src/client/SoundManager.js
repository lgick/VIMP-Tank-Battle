import { sound } from '@pixi/sound';
import { Assets } from 'pixi.js';

export default class SoundManager {
  constructor() {
    // хранилище для загруженных звуков
    // Map<soundName, soundInstance>
    this._sounds = new Map();
  }

  /**
   * Асинхронно загружает все звуки из предоставленного списка
   * @param {Object} soundList - Объект, где ключ - имя звука, значение - путь к файлу.
   *   Пример: { shot: '/sounds/shot.mp3', explosion: '/sounds/explosion.mp3' }
   */
  async load(soundList) {
    const assetsToLoad = [];

    for (const name in soundList) {
      if (Object.hasOwn(soundList, name)) {
        // Создаем массив объектов для загрузчика Assets,
        // указывая алиас и путь к файлу.
        assetsToLoad.push({ alias: name, src: soundList[name] });
      }
    }

    // Асинхронно загружаем все добавленные звуки с помощью PIXI.Assets.
    try {
      const loadedSounds = await Assets.load(assetsToLoad);
      // Сохраняем загруженные экземпляры в наше хранилище.
      for (const name in loadedSounds) {
        if (Object.hasOwn(loadedSounds, name)) {
          this._sounds.set(name, loadedSounds[name]);
        }
      }
      console.log('All sounds loaded successfully!');
    } catch (error) {
      console.error('Error loading sounds:', error);
    }
  }

  /**
   * Воспроизводит звук по его имени.
   * @param {string} name - Имя звука (ключ из soundList).
   * @param {Object} [options] - Опции воспроизведения (например, { volume: 0.5, loop: false }).
   */
  play(name, options) {
    if (!this._sounds.has(name)) {
      console.warn(`SoundManager: Sound "${name}" not found.`);
      return;
    }

    const soundInstance = this._sounds.get(name);
    soundInstance.play(options);
  }

  /**
   * Останавливает воспроизведение звука по его имени.
   * @param {string} name - Имя звука.
   */
  stop(name) {
    if (!this._sounds.has(name)) {
      return;
    }

    this._sounds.get(name).stop();
  }

  /**
   * Устанавливает общую громкость для всех звуков.
   * @param {number} volume - Значение от 0.0 (тишина) до 1.0 (полная громкость).
   */
  setGlobalVolume(volume) {
    sound.volumeAll = Math.max(0, Math.min(1, volume));
  }
}
