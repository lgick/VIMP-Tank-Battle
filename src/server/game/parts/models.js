export default {
  // tank
  m1: {
    density: 0.04,
    width: 48,
    height: 36,
    maxGunAngle: 90,
    gunAngleStep: 30,
    constructor: 'tank',
    currentBullet: 'b3',
    bullets: {
      b1: 1000,
      b2: 3000,
      b3: 30,
    },
  },

  // tank2
  m2: {
    density: 0.05,
    width: 48,
    height: 36,
    maxGunAngle: 90,
    gunAngleStep: 30,
    constructor: 'tank',
    currentBullet: 'b2',
    bullets: {
      b1: 1000,
      b2: 3000,
    },
  },
};
