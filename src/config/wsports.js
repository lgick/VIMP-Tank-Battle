export default {
  // порты получения данные от сервера
  server: {
    CONFIG: 0,
    AUTH_DATA: 1,
    AUTH_RESULT: 2,
    MAP_DATA: 3,
    FIRST_EVENTS: 4,
    EVENTS: 5,
    SNAPSHOT: 6,
    SOUND: 7,
    GAME_INFORM_DATA: 8,
    TECH_INFORM_DATA: 9,
    MISC: 10,
    PING: 11,
    CLEAR: 12,
    CONSOLE: 13,
  },
  // порты получения данных от клиента
  client: {
    CONFIG_READY: 0,
    AUTH_RESPONSE: 1,
    MODULES_READY: 2,
    MAP_READY: 3,
    FIRST_EVENTS_READY: 4,
    KEYS_DATA: 5,
    CHAT_DATA: 6,
    VOTE_DATA: 7,
    PONG: 8,
  },
};
