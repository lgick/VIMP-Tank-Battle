// tank
exports.m1 = {
  mass: 4,
  width: 48,
  height: 36,
  acceleration: 0,
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
    b3: 30
  }
};

// tank2
exports.m2 = {
  mass: 5,
  width: 48,
  height: 36,
  acceleration: 0,
  maxForward: 40,
  maxBack: 10,
  step: 0.5,
  maxGunAngle: 90,
  gunAngleStep: 30,
  constructor: 'tank',
  currentBullet: 'b2',
  bullets: {
    b1: 1000,
    b2: 3000
  }
};

// soldier
exports.m3 = {
  mass: 1,
  width: 4,
  height: 4,
  maxForward: 10,
  constructor: 'soldier',
  currentBullet: 'b3',
  bullets: {
    b1: 1000,
    b2: 3000,
    b3: 3
  }
};
