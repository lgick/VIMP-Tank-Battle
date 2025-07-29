import VIMP from '../server/modules/VIMP.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: true,
  maxPlayers: 10,
  VIMP,
};
