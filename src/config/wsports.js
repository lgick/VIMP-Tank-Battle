export default {
  // порты получения данные от сервера
  server: {
    CONFIG_DATA: 0,
    AUTH_DATA: 1,
    AUTH_ERRORS: 2,
    MAP_DATA: 3,
    FIRST_SHOT_DATA: 4,
    SHOT_DATA: 5,
    SOUND_DATA: 6,
    GAME_INFORM_DATA: 7,
    TECH_INFORM_DATA: 8,
    MISC: 9,
    PING: 10,
    CLEAR: 11,
    CONSOLE: 12,
  },
  // порты получения данных от клиента
  client: {
    CONFIG_READY: 0,
    AUTH_RESPONSE: 1,
    MAP_READY: 2,
    FIRST_SHOT_READY: 3,
    KEYS_DATA: 4,
    CHAT_DATA: 5,
    VOTE_DATA: 6,
    PONG: 7,
  },
};
