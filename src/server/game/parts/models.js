export default {
  // tank
  m1: {
    mass: 20,
    width: 48,
    height: 36,
    maxForward: 20,
    maxBack: 10,
    step: 0.5,
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
    mass: 30,
    width: 48,
    height: 36,
    maxForward: 40,
    maxBack: 10,
    step: 0.5,
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
