/**
 * @class BotManager
 * @description Управляет жизненным циклом ботов в игре:
 * создание, удаление и хранение их данных.
 */
class BotManager {
  /**
   * @param {VIMP} vimp - Экземпляр основного класса игры VIMP.
   * @param {Game} game - Экземпляр игрового движка (физика).
   * @param {Panel} panel - Экземпляр менеджера панели игрока.
   * @param {Stat} stat - Экземпляр менеджера статистики.
   */
  constructor(vimp, game, panel, stat) {
    this._vimp = vimp;
    this._game = game;
    this._panel = panel;
    this._stat = stat;

    this._model = 'm1'; // модель танка для ботов
    this._bots = new Map();
    this._scaledMapData = null; // данные карты для респаунов
  }

  /**
   * @description Получает данные о текущей карте для определения точек респауна.
   * @param {object} mapData - Данные масштабированной карты.
   */
  createMap(mapData) {
    this._scaledMapData = mapData;
  }

  /**
   * @description Генерирует уникальный идентификатор для бота.
   * @returns {string} Уникальный gameId для бота.
   * @private
   */
  _getGameId() {
    const prefix = 'Player';
    let counter = 0;

    while (this._bots.has(`${prefix} ${counter}`)) {
      counter += 1;
    }

    return `${prefix} ${counter}`;
  }

  /**
   * @description Создаёт заданное количество ботов.
   * @param {number} count - Количество ботов для создания.
   * @param {string|null} teamName - Имя команды. Если null, боты
   * распределяются равномерно.
   * @returns {number} Количество фактически созданных ботов.
   */
  createBots(count, teamName = null) {
    if (!this._scaledMapData?.respawns) {
      return 0;
    }

    const playableTeams = Object.keys(this._vimp._teams).filter(
      t => t !== this._vimp._spectatorTeam,
    );

    let createdCount = 0;

    for (let i = 0; i < count; i += 1) {
      const totalPlayers =
        Object.keys(this._vimp._users).length + this._bots.size;

      if (totalPlayers >= this._vimp._maxPlayers) {
        break; // достигнут глобальный лимит игроков
      }

      let targetTeam = teamName;

      if (!targetTeam) {
        // логика равномерного распределения
        targetTeam = playableTeams.sort((a, b) => {
          const sizeA = this._vimp._teamSizes[a]?.size || 0;
          const sizeB = this._vimp._teamSizes[b]?.size || 0;
          return sizeA - sizeB;
        })[0];
      }

      if (
        !targetTeam ||
        !this._scaledMapData.respawns[targetTeam] ||
        this._vimp._teamSizes[targetTeam].size >=
          this._scaledMapData.respawns[targetTeam].length
      ) {
        // нет свободных мест в команде, или команда не найдена
        continue;
      }

      const gameId = this._getGameId();
      const name = this._vimp.checkName(gameId);
      const teamId = this._vimp._teams[targetTeam];
      const botData = {
        name,
        gameId,
        team: targetTeam,
        teamId,
        model: this._model,
        isBot: true,
      };

      this._bots.set(gameId, botData);

      // регистрация бота в системах игры
      this._stat.addUser(gameId, teamId, { name, latency: 'BOT' });
      this._panel.addUser(gameId);
      this._vimp._teamSizes[targetTeam].add(gameId);

      createdCount += 1;
    }

    return createdCount;
  }

  /**
   * @description Удаляет ботов.
   * @param {string|null} teamName - Если указано, удаляет ботов
   * только из этой команды. Иначе удаляет всех.
   */
  removeBots(teamName = null) {
    const botsToRemove = teamName
      ? [...this._bots.keys()].filter(
          gameId => this._bots.get(gameId).team === teamName,
        )
      : [...this._bots.keys()];

    botsToRemove.forEach(gameId => this.removeBotById(gameId));
  }

  /**
   * @description Удаляет конкретного бота по его ID.
   * @param {string} gameId - Идентификатор бота для удаления.
   */
  removeBotById(gameId) {
    const botData = this._bots.get(gameId);

    if (!botData) {
      return;
    }

    // удаление бота из систем игры
    this._stat.removeUser(gameId, botData.teamId);
    this._panel.removeUser(gameId);
    this._vimp._teamSizes[botData.team].delete(gameId);
    this._game.removePlayer(gameId);

    this._bots.delete(gameId);
  }

  /**
   * @description Удаляет одного бота из указанной команды,
   * чтобы освободить место.
   * @param {string} teamName - Имя команды.
   * @returns {boolean} - true, если бот был удален, иначе false.
   */
  removeOneBotForPlayer(teamName) {
    for (const botData of this._bots.values()) {
      if (botData.team === teamName) {
        this.removeBotById(botData.gameId);
        return true;
      }
    }

    return false;
  }

  /**
   * @description Возвращает botData по gameId
   * @param {string} gameId
   * @returns {object | undefined} - botData или undefined, если нет такого gameId
   */
  getBotById(gameId) {
    return this._bots.get(gameId);
  }

  /**
   * @description Возвращает итератор для перебора всех ботов.
   * @returns {Iterator<object>}
   */
  getBots() {
    return this._bots.values();
  }

  /**
   * @description Подсчитывает текущее количество ботов в каждой команде.
   * @returns {object} Объект, где ключ - название команды,
   * значение - количество ботов.
   */
  getBotCountsPerTeam() {
    const counts = {};

    for (const botData of this._bots.values()) {
      const team = botData.team;

      counts[team] = (counts[team] || 0) + 1;
    }

    return counts;
  }
}

export default BotManager;
