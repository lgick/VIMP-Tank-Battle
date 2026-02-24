const weaponList = ['w1', 'w2'];

const weaponConfig = {
  // bullet
  w1: {
    type: 'hitscan',
    impulseMagnitude: 5000, // сила импульса (кг*м/с)
    damage: 40, // урон от одного попадания
    range: 1500, // максимальная дальность выстрела (в игровых юнитах)
    fireRate: 0.01, // кулдаун между выстрелами (0 - отсутствует)
    spread: 0, // разброс в радианах (0 для идеальной точности)
    cameraShake: {
      intensity: 20, // сила тряски (в пикселях)
      duration: 200, // продолжительность (в миллисекундах)
    },
  },

  // bomb
  w2: {
    type: 'physical',
    time: 300,
    next: 'w3',
    size: 8,
    fireRate: 0.1, // кулдаун (0 - отсутствует)
    detonateOnImpact: true, // детонация при физическом воздействии
    impulseMagnitude: 0, // импульс для скорости (бомба на месте спавна)
    damping: {
      linear: 1, // сопротивление при движении
      angular: 30.0, // сопротивление вращению (при повороте)
    },
    fixture: {
      shape: 'box', // форма (box, circle)
      density: 200, // плотность (0+)
      friction: 0.5, // трение (0 - 1)
      restitution: 0.1, // отскок при столкновении (0 - 1)
    },
  },

  w3: {
    type: 'aoe',
    damage: 70, // урон в эпицентре
    radius: 50, // радиус взрыва
    impulseMagnitude: 2000000, // сила импульса
    cameraShake: {
      intensity: 30, // сила тряски (в пикселях)
      duration: 400, // продолжительность (в миллисекундах)
    },
  },
};

export { weaponList, weaponConfig };
