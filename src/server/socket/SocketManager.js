const TECH_CODES = {
  fullServer: [0],
  anotherDevice: [1],
  sendMap: [2],
  kickIdle: [3],
  kickForMaxLatency: [4],
  kickForMissedPings: [5],
};

const GAME_CODES = {
  winnerTeam: [0],
  roundStart: [1],
  gameOver: [2],
};

export default class SocketManager {
  constructor(ports) {
    this._PORT_CONFIG_DATA = ports.CONFIG_DATA;
    this._PORT_AUTH_DATA = ports.AUTH_DATA;
    this._PORT_AUTH_RESULT = ports.AUTH_RESULT;
    this._PORT_MAP_DATA = ports.MAP_DATA;
    this._PORT_FIRST_SHOT_DATA = ports.FIRST_SHOT_DATA;
    this._PORT_SHOT_DATA = ports.SHOT_DATA;
    this._PORT_SOUND_DATA = ports.SOUND_DATA;
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
   * @param {string} socketId - ID соединения.
   * @param {Object} socket - Объект WebSocket с методами send и close.
   */
  addUser(socketId, socket) {
    this._senders.set(socketId, socket.send.bind(socket));
    this._closers.set(socketId, socket.close.bind(socket));
  }

  /**
   * Удаление пользователя из менеджера.
   * @param {string} socketId - ID соединения.
   */
  removeUser(socketId) {
    this._senders.delete(socketId);
    this._closers.delete(socketId);
  }

  /**
   * Логирование ошибки отправки сообщения.
   * @private
   * @param {string} socketId
   * @param {number} port
   * @param {*} data
   */
  _logSendError(socketId, port, data) {
    console.warn(`
      [SocketManager Error]:
        Attempted to send data to a non-existent or already closed socket.
        - Socket ID: ${socketId}
        - Port: ${port}
        - Data (sample): ${JSON.stringify(data)?.substring(0, 300)}
      `);
  }

  /**
   * Логирование ошибки закрытия соединения.
   * @private
   * @param {string} socketId
   * @param {number} code
   * @param {*} data
   */
  _logCloseError(socketId, code, data) {
    console.warn(`
      [SocketManager Error]:
        Attempted to close a non-existent or already closed socket.
        - Socket ID: ${socketId}
        - Close Code: ${code}
        - Data (sample): ${JSON.stringify(data)?.substring(0, 300)}
      `);
  }

  /**
   * Отправка данных на клиент с проверкой наличия соединения.
   * @private
   * @param {string} socketId
   * @param {number} port
   * @param {*} data
   */
  _send(socketId, port, data) {
    const sender = this._senders.get(socketId);

    if (sender) {
      sender(port, data);
    } else {
      this._logSendError(socketId, port, data);
    }
  }

  /**
   * Закрытие WebSocket-соединения с клиента с проверкой.
   * @private
   * @param {string} socketId
   * @param {number} code
   * @param {*} data
   */
  _close(socketId, code, data) {
    const closer = this._closers.get(socketId);

    if (closer) {
      closer(code, data);
    } else {
      this._logCloseError(socketId, code, data);
    }
  }

  /**
   * Закрытие соединения с отправкой технического сообщения.
   * @param {string} socketId
   * @param {number} code - Код закрытия.
   * @param {string} [key] - Ключ технического события (TECH_CODES).
   * @param {Array|undefined} [arr] - Дополнительные параметры.
   */
  close(socketId, code, key, arr) {
    if (key) {
      const data = Array.isArray(arr)
        ? [...TECH_CODES[key], arr]
        : TECH_CODES[key];

      this._close(socketId, code, data);
    } else {
      this._close(socketId, code);
    }
  }

  /**
   * Отправка конфигурационных данных.
   * @param {string} socketId
   * @param {*} config
   */
  sendConfig(socketId, config) {
    this._send(socketId, this._PORT_CONFIG_DATA, config);
  }

  /**
   * Отправка данных для авторизации.
   * @param {string} socketId
   * @param {*} authData
   */
  sendAuthData(socketId, authData) {
    this._send(socketId, this._PORT_AUTH_DATA, authData);
  }

  /**
   * Отправка данных о результате авторизации.
   * @param {string} socketId
   * @param {*} data
   */
  sendAuthResult(socketId, data) {
    this._send(socketId, this._PORT_AUTH_RESULT, data);
  }

  /**
   * Отправка ping для измерения RTT.
   * @param {string} socketId
   * @param {number} pingIdCounter
   */
  sendPing(socketId, pingIdCounter) {
    this._send(socketId, this._PORT_PING, pingIdCounter);
  }

  /**
   * Отправка команды очистки данных.
   * @param {string} socketId
   * @param {Array|string} [setIdList]
   */
  sendClear(socketId, setIdList) {
    if (setIdList) {
      this._send(socketId, this._PORT_CLEAR, setIdList);
    } else {
      this._send(socketId, this._PORT_CLEAR);
    }
  }

  /**
   * Отправка технического сообщения.
   * @param {string} socketId
   * @param {string} [key] - Ключ технического события (TECH_CODES).
   * @param {Array|undefined} [arr] - Дополнительные параметры.
   */
  sendTechInform(socketId, key, arr) {
    if (key) {
      const data = Array.isArray(arr)
        ? [...TECH_CODES[key], arr]
        : TECH_CODES[key];

      this._send(socketId, this._PORT_TECH_INFORM_DATA, data);
    } else {
      this._send(socketId, this._PORT_TECH_INFORM_DATA);
    }
  }

  /**
   * Отправка данных карты.
   * @param {string} socketId
   * @param {*} mapData
   */
  sendMap(socketId, mapData) {
    this._send(socketId, this._PORT_MAP_DATA, mapData);
  }

  /**
   * Отправка первого кадра игры.
   * @param {string} socketId
   */
  sendFirstShot(socketId) {
    this._send(socketId, this._PORT_FIRST_SHOT_DATA, [
      this._game.getFullPlayersData(), // game
      0, // coords
      this._panel.getEmptyPanel(), // panel
      this._stat.getFull(), // stat
      0, // chat
      0,
      0, // keySet: 0 (наблюдатель)
    ]);
  }

  /**
   * Отправка первого голосования (выбор команды).
   * @param {string} socketId
   */
  sendFirstVote(socketId) {
    this._send(socketId, this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      0, // panel
      0, // stat
      0, // chat
      'firstVote', // vote: опрос выбора команды
    ]);
  }

  /**
   * Отправка игровых данных.
   * @param {string} socketId
   * @param {*} shotData
   */
  sendShot(socketId, shotData) {
    this._send(socketId, this._PORT_SHOT_DATA, shotData);
  }

  /**
   * Отправка базовых данных игрока.
   * @param {string} socketId
   * @param {string} gameId - ID игрока в игре.
   */
  sendPlayerDefaultShot(socketId, gameId) {
    this._send(socketId, this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      this._panel.getFullPanel(gameId), // panel
      0, // stat
      0, // chat
      0, // vote
      1, // keySet
    ]);
  }

  /**
   * Отправка базовых данных наблюдателя.
   * @param {string} socketId
   */
  sendSpectatorDefaultShot(socketId) {
    this._send(socketId, this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      this._panel.getEmptyPanel(), // panel
      0, // stat
      0, // chat
      0, // vote
      0, // keySet
    ]);
  }

  /**
   * Отправка информации о начале раунда.
   * @param {string} socketId
   */
  sendRoundStart(socketId) {
    this._send(socketId, this._PORT_SOUND_DATA, 'roundStart');
    this._send(socketId, this._PORT_GAME_INFORM_DATA, GAME_CODES['roundStart']);
  }

  /**
   * Отправка информации об окончании раунда.
   * @param {string} socketId
   * @param {string|number} [winnerTeam] - Победившая команда.
   */
  sendRoundEnd(socketId, winnerTeam) {
    let informData;

    if (winnerTeam) {
      informData = [...GAME_CODES['winnerTeam'], [winnerTeam]];
    } else {
      informData = GAME_CODES['gameOver'];
    }

    this._send(socketId, this._PORT_GAME_INFORM_DATA, informData);
  }

  /**
   * Отправка звука победы.
   * @param {string} socketId
   */
  sendVictory(socketId) {
    this._send(socketId, this._PORT_SOUND_DATA, 'victory');
  }

  /**
   * Отправка звука поражения.
   * @param {string} socketId
   */
  sendDefeat(socketId) {
    this._send(socketId, this._PORT_SOUND_DATA, 'defeat');
  }

  /**
   * Отправка команды смены имени.
   * @param {string} socketId
   * @param {string} name
   */
  sendName(socketId, name) {
    this._send(socketId, this._PORT_MISC, {
      key: 'localstorageNameReplace',
      value: name,
    });
  }

  /**
   * Отправка звука поражения цели.
   * @param {string} socketId
   */
  sendFragSound(socketId) {
    this._send(socketId, this._PORT_SOUND_DATA, 'frag');
  }
}
