export default {
  // порты получения данных на клиенте
  client: {
    CONFIG_DATA: 0,
    AUTH_DATA: 1,
    AUTH_ERRORS: 2,
    MAP_DATA: 3,
    SHOT_DATA: 4,
    INFORM_DATA: 5,
    MISC: 6,
    CLEAR: 7,
    CONSOLE: 8,
    PING: 9,
  },
  // порты получения данных на сервере
  server: {
    CONFIG_READY: 0,
    AUTH_RESPONSE: 1,
    MAP_READY: 2,
    KEYS_DATA: 3,
    CHAT_DATA: 4,
    VOTE_DATA: 5,
    PONG: 6,
  },
};
