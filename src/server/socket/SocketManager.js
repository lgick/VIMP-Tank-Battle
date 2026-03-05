const TECH_CODES = {
  fullServer: [0],
  anotherDevice: [1],
  loading: [2],
  kickIdle: [3],
  kickForMaxLatency: [4],
  kickForMissedPings: [5],
  failedToJoinGame: [6],
};

const GAME_CODES = {
  winnerTeam: [0],
  roundStart: [1],
  gameOver: [2],
};

export default class SocketManager {
  constructor(ports) {
    this._PORT_CONFIG = ports.CONFIG;
    this._PORT_AUTH_DATA = ports.AUTH_DATA;
    this._PORT_AUTH_RESULT = ports.AUTH_RESULT;
    this._PORT_MAP_DATA = ports.MAP_DATA;
    this._PORT_FIRST_EVENTS = ports.FIRST_EVENTS;
    this._PORT_EVENTS = ports.EVENTS;
    this._PORT_SNAPSHOT = ports.SNAPSHOT;
    this._PORT_SOUND = ports.SOUND;
    this._PORT_GAME_INFORM_DATA = ports.GAME_INFORM_DATA;
    this._PORT_TECH_INFORM_DATA = ports.TECH_INFORM_DATA;
    this._PORT_MISC = ports.MISC;
    this._PORT_PING = ports.PING;
    this._PORT_CLEAR = ports.CLEAR;
    this._PORT_CONSOLE = ports.CONSOLE;

    this._game = null;
    this._panel = null;
    this._stat = null;

    this._senders = new Map();
    this._closers = new Map();
  }

  /**
   * Инъекция игровых сервисов для формирования сложных сообщений.
   * @param {Object} game - Экземпляр игрового менеджера.
   * @param {Object} panel - Экземпляр менеджера панели.
   * @param {Object} stat - Экземпляр менеджера статистики.
   */
  injectServices(game, panel, stat) {
    this._game = game;
    this._panel = panel;
    this._stat = stat;
  }

  /**
   * Регистрация пользователя в менеджере.
   * @param {number} gameId - ID игрока в игре.
   * @param {Object} socket - Объект WebSocket с методами send и close.
   */
  addUser(gameId, socket) {
    this._senders.set(gameId, socket.send.bind(socket));
    this._closers.set(gameId, socket.close.bind(socket));
  }

  /**
   * Удаление пользователя из менеджера.
   * @param {number} gameId - ID игрока в игре.
   */
  removeUser(gameId) {
    this._senders.delete(gameId);
    this._closers.delete(gameId);
  }

  /**
   * Логирование ошибки отправки сообщения.
   * @private
   * @param {number} gameId - ID игрока в игре.
   * @param {number} port
   * @param {*} data
   */
  _logSendError(gameId, port, data) {
    console.warn(`
      [SocketManager Error]:
        Attempted to send data to a non-existent or already closed socket.
        - Socket ID: ${gameId}
        - Port: ${port}
        - Data (sample): ${JSON.stringify(data)?.substring(0, 300)}
      `);
  }

  /**
   * Логирование ошибки закрытия соединения.
   * @private
   * @param {number} gameId - ID игрока в игре.
   * @param {number} code
   * @param {*} data
   */
  _logCloseError(gameId, code, data) {
    console.warn(`
      [SocketManager Error]:
        Attempted to close a non-existent or already closed socket.
        - Socket ID: ${gameId}
        - Close Code: ${code}
        - Data (sample): ${JSON.stringify(data)?.substring(0, 300)}
      `);
  }

  /**
   * Отправка данных на клиент с проверкой наличия соединения.
   * @private
   * @param {number} gameId - ID игрока в игре.
   * @param {number} port
   * @param {*} data
   */
  _send(gameId, port, data) {
    const sender = this._senders.get(gameId);

    if (sender) {
      sender(port, data);
    } else {
      this._logSendError(gameId, port, data);
    }
  }

  /**
   * Закрытие WebSocket-соединения с клиента с проверкой.
   * @private
   * @param {number} gameId - ID игрока в игре.
   * @param {number} code
   * @param {*} data
   */
  _close(gameId, code, data) {
    const closer = this._closers.get(gameId);

    if (closer) {
      closer(code, data);
    } else {
      this._logCloseError(gameId, code, data);
    }
  }

  /**
   * Закрытие соединения с отправкой технического сообщения.
   * @param {number} gameId - ID игрока в игре.
   * @param {number} code - Код закрытия.
   * @param {string} [key] - Ключ технического события (TECH_CODES).
   * @param {Array|undefined} [arr] - Дополнительные параметры.
   */
  close(gameId, code, key, arr) {
    if (key) {
      const data = Array.isArray(arr)
        ? [...TECH_CODES[key], arr]
        : TECH_CODES[key];

      this._close(gameId, code, data);
    } else {
      this._close(gameId, code);
    }
  }

  /**
   * Отправка конфигурационных данных.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} config
   */
  sendConfig(gameId, config) {
    this._send(gameId, this._PORT_CONFIG, config);
  }

  /**
   * Отправка данных для авторизации.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} authData
   */
  sendAuthData(gameId, authData) {
    this._send(gameId, this._PORT_AUTH_DATA, authData);
  }

  /**
   * Отправка данных о результате авторизации.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} data
   */
  sendAuthResult(gameId, data) {
    this._send(gameId, this._PORT_AUTH_RESULT, data);
  }

  /**
   * Отправка ping для измерения RTT.
   * @param {number} gameId - ID игрока в игре.
   * @param {number} pingIdCounter
   */
  sendPing(gameId, pingIdCounter) {
    this._send(gameId, this._PORT_PING, pingIdCounter);
  }

  /**
   * Отправка команды очистки данных.
   * @param {number} gameId - ID игрока в игре.
   * @param {Array|string} [setIdList]
   */
  sendClear(gameId, setIdList) {
    if (setIdList) {
      this._send(gameId, this._PORT_CLEAR, setIdList);
    } else {
      this._send(gameId, this._PORT_CLEAR);
    }
  }

  /**
   * Отправка технического сообщения.
   * @param {number} gameId - ID игрока в игре.
   * @param {string} [key] - Ключ технического события (TECH_CODES).
   * @param {Array|undefined} [arr] - Дополнительные параметры.
   */
  sendTechInform(gameId, key, arr) {
    if (key) {
      const data = Array.isArray(arr)
        ? [...TECH_CODES[key], arr]
        : TECH_CODES[key];

      this._send(gameId, this._PORT_TECH_INFORM_DATA, data);
    } else {
      this._send(gameId, this._PORT_TECH_INFORM_DATA);
    }
  }

  /**
   * Отправка данных карты.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} mapData
   */
  sendMap(gameId, mapData) {
    this._send(gameId, this._PORT_MAP_DATA, mapData);
  }

  /**
   * Отправка первого кадра игры.
   * @param {number} gameId - ID игрока в игре.
   */
  sendFirstEvents(gameId) {
    this._send(gameId, this._PORT_FIRST_EVENTS, [
      this._panel.getEmptyPanel(), // panel
      this._stat.getFull(), // stat
      0, // chat
      0,
      0, // keySet: 0 (наблюдатель)
    ]);
  }

  /**
   * Отправка первого голосования (выбор команды).
   * @param {number} gameId - ID игрока в игре.
   */
  sendFirstVote(gameId) {
    this._send(gameId, this._PORT_EVENTS, [
      0, // panel
      0, // stat
      0, // chat
      { name: 'teamChange' }, // vote: выбор команды
    ]);
  }

  /**
   * Отправка игровых данных.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} data
   */
  sendSnapshot(gameId, data) {
    this._send(gameId, this._PORT_SNAPSHOT, data);
  }

  /**
   * Отправка данных модулей.
   * @param {number} gameId - ID игрока в игре.
   * @param {*} data
   */
  sendEvents(gameId, data) {
    this._send(gameId, this._PORT_EVENTS, data);
  }

  /**
   * Отправка базовых данных игрока.
   * @param {number} gameId - ID игрока в игре.
   */
  sendPlayerDefaultEvents(gameId) {
    this._send(gameId, this._PORT_EVENTS, [
      this._panel.getFullPanel(gameId), // panel
      0, // stat
      0, // chat
      0, // vote
      1, // keySet
    ]);
  }

  /**
   * Отправка базовых данных наблюдателя.
   * @param {number} gameId - ID игрока в игре.
   */
  sendSpectatorDefaultEvents(gameId) {
    this._send(gameId, this._PORT_EVENTS, [
      this._panel.getEmptyPanel(), // panel
      0, // stat
      0, // chat
      0, // vote
      0, // keySet
    ]);
  }

  /**
   * Отправка информации о начале раунда.
   * @param {number} gameId - ID игрока в игре.
   */
  sendRoundStart(gameId) {
    this._send(gameId, this._PORT_SOUND, 'roundStart');
    this._send(gameId, this._PORT_GAME_INFORM_DATA, GAME_CODES['roundStart']);
  }

  /**
   * Отправка информации об окончании раунда.
   * @param {number} gameId - ID игрока в игре.
   * @param {string|number} [winnerTeam] - Победившая команда.
   */
  sendRoundEnd(gameId, winnerTeam) {
    let informData;

    if (winnerTeam) {
      informData = [...GAME_CODES['winnerTeam'], [winnerTeam]];
    } else {
      informData = GAME_CODES['gameOver'];
    }

    this._send(gameId, this._PORT_GAME_INFORM_DATA, informData);
  }

  /**
   * Отправка звука победы.
   * @param {number} gameId - ID игрока в игре.
   */
  sendVictory(gameId) {
    this._send(gameId, this._PORT_SOUND, 'victory');
  }

  /**
   * Отправка звука поражения.
   * @param {number} gameId - ID игрока в игре.
   */
  sendDefeat(gameId) {
    this._send(gameId, this._PORT_SOUND, 'defeat');
  }

  /**
   * Отправка команды смены имени.
   * @param {number} gameId - ID игрока в игре.
   * @param {string} name
   */
  sendName(gameId, name) {
    this._send(gameId, this._PORT_MISC, {
      key: 'localstorageNameReplace',
      value: name,
    });
  }

  /**
   * Отправка звука поражения цели.
   * @param {number} gameId - ID игрока в игре.
   */
  sendFragSound(gameId) {
    this._send(gameId, this._PORT_SOUND, 'frag');
  }

  /**
   * Отправка звук уничтожения.
   * @param {number} gameId - ID игрока в игре.
   */
  sendGameOverSound(gameId) {
    this._send(gameId, this._PORT_SOUND, 'gameOver');
  }
}
