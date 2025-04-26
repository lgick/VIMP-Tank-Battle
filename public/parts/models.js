export default {
  // tank
  m1: {
    size: 10, // соотношение сторон танка 4:3, то есть widht: size*4, height: size*3
    constructor: 'tank',
    currentBullet: 'b1',
    bullets: {
      b1: 1000,
      b2: 3000,
    },
  },
};
