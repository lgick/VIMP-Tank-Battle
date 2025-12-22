import Publisher from '../../../lib/Publisher.js';
import Factory from '../../../lib/factory.js';

// линейная интерполяция
function lerp(start, end, alpha) {
  return start + (end - start) * alpha;
}

// GameModel
export default class GameModel {
  constructor(assetsCollection, dependenciesCollection, data) {
    // коллекция ассетов (Map)
    this._assets = assetsCollection || new Map();

    // пропорции изображения на полотне
    const [w, h] = (data.baseScale || '1:1')
      .split(':')
      .map(value => Number(value));

    this._baseScale = Number((w / h).toFixed(2));

    if (data.cameraSettings) {
      this._dynamicCamera = true;
      this._lerpFactor = data.cameraSettings?.lerpFactor;
      this._lookAheadFactor = data.cameraSettings?.lookAheadFactor;
      this._zoomOutFactor = data.cameraSettings?.zoomOutFactor;
      this._minZoomLimit = data.cameraSettings?.minZoomLimit || 1.0;
    }

    // состояние для динамической камеры
    this._prevCoordX = 0; // предыдущая координата X
    this._prevCoordY = 0; // предыдущая координата Y
    this._currentLookAheadX = 0; // текущее смещение камеры по X
    this._currentLookAheadY = 0; // текущее смещение камеры по Y
    this._currentExtraZoom = 1.0; // множитель зума (1.0 = без изменений)

    // коллекция зависимостей (Map)
    this._dependencies = dependenciesCollection || new Map();

    this._data = {};
    this._managedEffects = {};
    this.publisher = new Publisher();
  }

  // создает экземпляры вида:
  // this._data['Tank']['01']   - игрок c id '01'
  // this._data['Map']['1']     - данные карты на 1 слое
  // this._data['Bullet']['f2'] - пуля с id 'f2'
  //
  // constructor - имя конструктора для экземпляра
  // id          - id экземпляра
  // data        - данные для создания экземпляра
  create(constructor, id, data) {
    const instance = Factory(
      constructor,
      data,
      this._assets.get(constructor),
      this._dependencies.get(constructor),
    );

    this._data[constructor] = this._data[constructor] || {};
    this._data[constructor][id] = instance;
    this.publisher.emit('create', instance);
  }

  // создает экземпляр эффекта (например анимация выстрела или дыма)
  // this._managedEffects['ShotEffect'] = [
  //   [100, 1000, 11, 1, true], [200, 200, 200, 200, false]
  // ]
  createEffect(constructor, data) {
    const instance = Factory(
      constructor,
      data,
      this._assets.get(constructor),
      this._dependencies.get(constructor),
    );

    this._managedEffects[constructor] =
      this._managedEffects[constructor] || new Set();
    this._managedEffects[constructor].add(instance);

    const originalDestroy = instance.destroy;

    // proxy destroy - для удаления завершенных эффектов из this._managedEffects
    instance.destroy = (...args) => {
      if (this._managedEffects[constructor]?.has(instance)) {
        this._managedEffects[constructor].delete(instance);

        if (this._managedEffects[constructor].size === 0) {
          delete this._managedEffects[constructor];
        }
      }

      originalDestroy.apply(instance, args);
    };

    this.publisher.emit('createEffect', instance);
  }

  // возвращает данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора
  // - все данные
  read(constructor, id) {
    // если нужны данные по конструктору
    if (constructor) {
      // .. и они существуют
      if (this._data[constructor]) {
        // .. и также нужны данные конкретного id
        if (id) {
          // .. и они существуют
          if (this._data[constructor][id]) {
            return this._data[constructor][id];
          }
        } else {
          return this._data[constructor];
        }
      }
    } else {
      return this._data;
    }
  }

  // обновляет данные экземпляра
  update(constructor, id, data) {
    if (data === null) {
      this.remove(constructor, id);
    } else {
      this._data[constructor][id].update(data);
    }
  }

  // удаляет данные:
  // - экземпляра конструктора
  // - всех экземляров конструктора (пустой конструктор)
  // - все данные (чистое полотно)
  //
  // constructor - имя конструктора для экземпляра (необязательно)
  // id          - id экземпляра (необязательно)
  remove(constructor, id) {
    // если данные по конструктору
    if (constructor) {
      // .. и данные по конструктору существуют
      if (this._data[constructor]) {
        // если данные по конкретному id
        if (id) {
          // .. и они существуют
          if (this._data[constructor][id]) {
            this.publisher.emit('remove', this._data[constructor][id]);
            delete this._data[constructor][id];
          }
        } else {
          const data = this._data[constructor];

          for (const id in data) {
            if (Object.hasOwn(data, id)) {
              this.publisher.emit('remove', data[id]);
            }
          }

          delete this._data[constructor];
        }
        // иначе, если данные существуют в эффектах
      } else if (this._managedEffects[constructor]) {
        const effectsSet = this._managedEffects[constructor];

        Array.from(effectsSet).forEach(effect => {
          this.publisher.emit('remove', effect);
        });
      }
      // иначе удаление всех данных
    } else {
      for (const constructor in this._data) {
        if (Object.hasOwn(this._data, constructor)) {
          const data = this._data[constructor];

          for (const id in data) {
            if (Object.hasOwn(data, id)) {
              this.publisher.emit('remove', data[id]);
            }
          }
        }
      }

      this._data = {};

      Object.keys(this._managedEffects).forEach(constructor => {
        const effectsSet = this._managedEffects[constructor];

        if (effectsSet) {
          Array.from(effectsSet).forEach(effect => {
            this.publisher.emit('remove', effect);
          });
        }
      });
    }
  }

  // вычисляет координаты для отображения
  updateScreenCoords(coords) {
    const { x, y } = coords;

    if (this._dynamicCamera) {
      // расчет вектора скорости на основе изменения координат
      const vX = x - this._prevCoordX;
      const vY = y - this._prevCoordY;

      this._prevCoordX = x;
      this._prevCoordY = y;

      // плавная интерполяция смещения
      this._currentLookAheadX = lerp(
        this._currentLookAheadX,
        vX * this._lookAheadFactor,
        this._lerpFactor,
      );

      this._currentLookAheadY = lerp(
        this._currentLookAheadY,
        vY * this._lookAheadFactor,
        this._lerpFactor,
      );

      // скорость (magnitude)
      const speed = Math.sqrt(vX * vX + vY * vY);

      // расчет динамического зума
      // (чем выше скорость, тем меньше масштаб (отдаление))
      // формула: 1 / (1 + speed * factor) создаст плавную кривую уменьшения
      let targetExtraZoom = 1 / (1 + speed * this._zoomOutFactor);

      // ограничение максимального отдаления
      if (targetExtraZoom < this._minZoomLimit) {
        targetExtraZoom = this._minZoomLimit;
      }

      // плавная интерполяция зума
      this._currentExtraZoom = lerp(
        this._currentExtraZoom,
        targetExtraZoom,
        this._lerpFactor,
      );
    }

    this.publisher.emit('updateScreenCoords', {
      coords: {
        x: x + this._currentLookAheadX,
        y: y + this._currentLookAheadY,
      },
      scale: this._baseScale * this._currentExtraZoom,
    });
  }
}
