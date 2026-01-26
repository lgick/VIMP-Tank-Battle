import BinaryGenId, { ID_FORMATS } from '../../lib/BinaryGenId.js';

/**
 * @class GameState
 * @description Хранилище данных (Model).
 * Содержит списки игроков, команд, настройки карты и методы работы с ними.
 */
class GameState {
  /**
   * @param {object} data - Конфигурационные данные игры.
   */
  constructor(data) {
    this.isDevMode = data.isDevMode || false; // флаг режима разработки
    this.maxPlayers = data.maxPlayers; // максимальное количество игроков
    this.spectatorKeys = data.spectatorKeys; // клавиши наблюдателя

    // таймауты
    this.idleTimeoutForPlayer = data.idleKickTimeout?.player || null;
    this.idleTimeoutForSpectator = data.idleKickTimeout?.spectator || null;

    // карты
    this.maps = data.maps; // карты
    this.mapList = Object.keys(this.maps); // список карт массивом
    this.mapsInVote = data.mapsInVote; // карт в голосовании
    this.mapScale = data.mapScale;
    this.mapSetId = data.mapSetId; // дефолтный id конструктора карт
    this.currentMapName = data.currentMap; // название текущей карты
    this._startMapNumber = 0; // номер первой карты в голосовании

    // данные текущей загруженной карты
    this.currentMapData = null;
    this.scaledMapData = null;

    // игроки
    this.users = new Map(); // игроки { gameId: UserData }
    this.userIdGen = new BinaryGenId(ID_FORMATS.UINT8);

    // команды
    // team: teamId; { team1: 1, team2: 2, spectators: 3 }
    this.teams = data.teams;
    // название команды наблюдателя
    this.spectatorTeam = data.spectatorTeam;
    // id команды наблюдателя
    this.spectatorId = this.teams[this.spectatorTeam];

    // количество игроков в командах
    // { team1: new Set(), team2: new Set(), spectators: new Set() }
    this.teamSizes = Object.keys(this.teams).reduce((acc, key) => {
      acc[key] = new Set();
      return acc;
    }, {});

    // списки активности
    // список gameId активных игроков на полотне для наблюдения
    // (кроме убитых игроков)
    this.activePlayersList = [];
    // список gameId игроков для удаления с полотна
    this.removedPlayersList = [];

    // флаг, если раунд процессе завершения
    this.isRoundEnding = false;
  }

  /**
   * @description Создаёт уникальный gameId.
   */
  createGameId() {
    return this.userIdGen.next();
  }

  /**
   * @description Освобождает gameId.
   */
  removeGameId(gameId) {
    this.userIdGen.release(gameId);
  }

  /**
   * @description Проверяет уникальность имени и добавляет #number, если занято.
   * @param {string} name
   * @param {number} number
   */
  checkName(name, number = 1) {
    for (const user of this.users.values()) {
      if (user.name === name) {
        let newName;
        if (number > 1) {
          newName = name.slice(0, name.lastIndexOf('#')) + '#' + number;
        } else {
          newName = name + '#' + number;
        }
        return this.checkName(newName, number + 1);
      }
    }
    return name;
  }

  /**
   * @description Возвращает данные пользователя по gameId.
   */
  getUser(gameId) {
    return this.users.get(gameId);
  }

  /**
   * @description Добавляет пользователя в state.
   */
  addUser(params, socketId) {
    const gameId = this.createGameId();

    const data = {
      // gameId игрока
      gameId,
      // socketId игрока, для ws коммуникации
      socketId,
      // флаг готовности игрока
      isReady: false,
      // текущая карта игры
      currentMap: null,
      // имя пользователя
      name: this.checkName(params.name),
      // модель игрока
      model: params.model,
      // название команды
      team: this.spectatorTeam,
      // id команды
      teamId: this.spectatorId,
      // флаг наблюдателя за игрой
      // (true у игроков, которые в текущий момент наблюдают за игрой)
      isWatching: true,
      // id наблюдаемого игрока
      watchedGameId: this.activePlayersList[0] || null,
      // флаг для сброса камеры клиента
      forceCameraReset: true,
      // данные для тряски камеры
      pendingShake: null,
      // фиксация времени активности пользователя
      lastActionTime: Date.now(),
    };

    this.users.set(gameId, data);
    this.teamSizes[data.team].add(data.gameId);

    return data;
  }

  /**
   * @description Удаляет пользователя из всех списков state.
   * @returns {object|null} Удаленный объект пользователя или null.
   */
  removeUser(gameId) {
    const user = this.users.get(gameId);

    if (!user) {
      return null;
    }

    // удаление из счетчиков команд
    this.teamSizes[user.team].delete(gameId);

    // освобождение ID
    this.removeGameId(gameId);

    // удаление из списка активных (если был)
    this.removeFromActivePlayers(gameId);

    // если это был игрок (не наблюдатель),
    // добавляем в список "на удаление с клиента"
    if (user.team !== this.spectatorTeam) {
      this.removedPlayersList.push({
        gameId,
        model: user.model,
      });
    }

    this.users.delete(gameId);

    return user;
  }

  /**
   * @description Сбрасывает счетчики команд.
   */
  resetTeamSizes() {
    for (const key in this.teamSizes) {
      this.teamSizes[key].clear();
    }
  }

  /**
   * @description Добавляет в список играющих пользователей.
   */
  addToActivePlayers(gameId) {
    if (!this.activePlayersList.includes(gameId)) {
      this.activePlayersList.push(gameId);
    }
  }

  /**
   * @description Удаляет из списка играющих пользователей.
   */
  removeFromActivePlayers(gameId) {
    this.activePlayersList = this.activePlayersList.filter(id => id !== gameId);

    // обновление наблюдателей (если они смотрели за удаленным)
    for (const user of this.users.values()) {
      if (user.watchedGameId === gameId) {
        user.watchedGameId = this.activePlayersList[0] || null;
      }
    }
  }

  /**
   * @description Создаёт и возвращает список карт для голосования
   */
  getMapList() {
    if (this.mapList.length <= this.mapsInVote) {
      return this.mapList;
    }

    let endNumber = this._startMapNumber + this.mapsInVote;
    let maps = this.mapList.slice(this._startMapNumber, endNumber);

    if (maps.length < this.mapsInVote) {
      endNumber = this.mapsInVote - maps.length;
      maps = maps.concat(this.mapList.slice(0, endNumber));
    }

    this._startMapNumber = endNumber;

    return maps;
  }
}

export default GameState;
