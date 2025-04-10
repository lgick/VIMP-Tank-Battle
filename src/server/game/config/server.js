import VIMP from '../modules/index.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 10,
  VIMP,
  ports: {
    config: 0,
    auth: 1,
    authErr: 2,
    map: 3,
    shot: 4,
    inform: 5,
    misc: 6,
    clear: 7,
    log: 8,
  },
};
