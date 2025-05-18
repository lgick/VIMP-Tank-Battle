import VIMP from '../modules/index.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 10,
  VIMP,
  WSPortFromClient: {
    CONFIG_READY: 0,
    AUTH_RESPONSE: 1,
    MAP_READY: 2,
    KEYS_DATA: 3,
    CHAT_DATA: 4,
    VOTE_DATA: 5,
    PING: 6,
  },
  WSPortToClient: {
    CONFIG_DATA: 0,
    AUTH_DATA: 1,
    AUTH_ERRORS: 2,
    MAP_DATA: 3,
    SHOT_DATA: 4,
    INFORM_DATA: 5,
    MISC: 6,
    CLEAR: 7,
    CONSOLE: 8,
    PONG: 9,
  },
};
