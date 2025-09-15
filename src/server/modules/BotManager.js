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
    this._bots = new Map(); // { botId: { name, team, teamId, model } }
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

      const botId = this._getGameId();
      const name = this._vimp.checkName(botId);
      const teamId = this._vimp._teams[targetTeam];
      const botData = {
        name,
        team: targetTeam,
        teamId,
        model: this._model,
      };

      this._bots.set(botId, botData);

      // регистрация бота в системах игры
      this._stat.addUser(botId, teamId, { name, latency: 'BOT' });
      this._panel.addUser(botId);
      this._vimp._teamSizes[targetTeam].add(botId);

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
    const botsToRemove = [];

    for (const [botId, botData] of this._bots.entries()) {
      if (!teamName || botData.team === teamName) {
        botsToRemove.push(botId);
      }
    }

    botsToRemove.forEach(botId => this.removeBotById(botId));
  }

  /**
   * @description Удаляет конкретного бота по его ID.
   * @param {string} botId - Идентификатор бота для удаления.
   */
  removeBotById(botId) {
    const botData = this._bots.get(botId);

    if (!botData) {
      return;
    }

    // удаление бота из систем игры
    this._stat.removeUser(botId, botData.teamId);
    this._panel.removeUser(botId);
    this._vimp._teamSizes[botData.team].delete(botId);
    this._game.removePlayer(botId);

    this._bots.delete(botId);
  }

  /**
   * @description Удаляет одного бота из указанной команды,
   * чтобы освободить место.
   * @param {string} teamName - Имя команды.
   * @returns {boolean} - true, если бот был удален, иначе false.
   */
  removeOneBotForPlayer(teamName) {
    for (const [botId, botData] of this._bots.entries()) {
      if (botData.team === teamName) {
        this.removeBotById(botId);
        return true;
      }
    }

    return false;
  }

  /**
   * @description Возвращает итератор для перебора всех ботов.
   * @returns {Iterator<[string, object]>}
   */
  getBots() {
    return this._bots.entries();
  }

  /**
   * @description Подсчитывает текущее количество ботов в каждой команде.
   * @returns {object} Объект, где ключ - название команды,
   * значение - количество ботов.
   */
  getBotCountsPerTeam() {
    const counts = {};

    for (const botData of this._bots.values()) {
      counts[botData.team] = (counts[botData.team] || 0) + 1;
    }

    return counts;
  }
}

export default BotManager;
