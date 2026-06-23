import BotController from './BotController.js';
import NavigationSystem from './NavigationSystem.js';
import SpatialManager from './SpatialManager.js';

// размер ячейки 600 (чуть больше MAX_FIRING_DISTANCE 500 у ботов)
const SPATIAL_CELL_SIZE = 600;

/**
 * @class BotManager
 * @description Управляет контроллерами и навигацией ботов.
 * Данные участников-ботов хранятся в ParticipantManager (единый реестр).
 */
class BotManager {
  /**
   * @param {ParticipantManager} participants - Единый реестр участников.
   * @param {Game} game - Экземпляр игрового движка (физика).
   * @param {Panel} panel - Экземпляр менеджера панели игрока.
   * @param {Stat} stat - Экземпляр менеджера статистики.
   */
  constructor(participants, game, panel, stat) {
    this._participants = participants;
    this._game = game;
    this._panel = panel;
    this._stat = stat;

    this._model = 'm1'; // модель танка для ботов
    this._respawns = null; // данные респаунов

    this._botControllers = new Map();
    this._navigationSystem = new NavigationSystem();

    // инициализация пространственного менеджера
    this._spatialManager = new SpatialManager(SPATIAL_CELL_SIZE);
  }

  /**
   * @description Обновляет логику всех активных ботов.
   * @param {number} dt
   */
  updateBots(dt) {
    for (const controller of this._botControllers.values()) {
      controller.update(dt);
    }
  }

  /**
   * @description Получает данные о текущей карте
   * для определения точек респауна.
   * @param {object} mapData - Данные масштабированной карты.
   */
  createMap(mapData) {
    this._respawns = mapData.respawns;
    this._navigationSystem.generateNavGraph(mapData);
  }

  /**
   * @description Находит путь между двумя точками (прокси-метод).
   * @param {Vec2} startPos
   * @param {Vec2} endPos
   * @returns {Vec2[] | null}
   */
  findPath(startPos, endPos) {
    return this._navigationSystem.findPath(startPos, endPos);
  }

  /**
   * @description Проверяет наличие прямой видимости
   * между двумя точками (прокси-метод).
   * @param {Vec2} startPos
   * @param {Vec2} endPos
   * @returns {boolean}
   */
  hasLineOfSight(startPos, endPos) {
    return !this._navigationSystem._hasObstacleBetween(startPos, endPos);
  }

  /**
   * @description Возвращает координаты случайного узла из навигационного графа.
   * Используется для определения цели патрулирования.
   * @returns {Vec2 | null} Координаты случайной точки или null,
   * если граф не готов.
   */
  getRandomNavNode() {
    return this._navigationSystem.getRandomNode();
  }

  /**
   * @description Создаёт заданное количество ботов.
   * @param {number} count - Количество ботов для создания.
   * @param {string|null} teamName - Имя команды.
   * Если null, боты распределяются равномерно.
   * @returns {number} Количество фактически созданных ботов.
   */
  createBots(count, teamName = null) {
    if (!this._respawns) {
      return 0;
    }

    const playableTeams = this._participants.getPlayableTeams();

    let createdCount = 0;

    for (let i = 0; i < count; i += 1) {
      if (this._participants.isFull) {
        break; // достигнут глобальный лимит игроков
      }

      let targetTeam = teamName;

      if (!targetTeam) {
        // логика равномерного распределения
        targetTeam = playableTeams.sort(
          (a, b) =>
            this._participants.getTeamSize(a) - this._participants.getTeamSize(b),
        )[0];
      }

      if (
        !targetTeam ||
        !this._respawns[targetTeam] ||
        this._participants.getTeamSize(targetTeam) >=
          this._respawns[targetTeam].length
      ) {
        // нет свободных мест в команде, или команда не найдена
        continue;
      }

      // запись участника-бота в едином реестре
      const gameId = this._participants.createBot({
        team: targetTeam,
        model: this._model,
      });
      const participant = this._participants.get(gameId);

      // контроллер для бота
      const controller = new BotController(
        this,
        this._game,
        this._panel,
        this._spatialManager,
        participant,
        this._participants,
      );

      participant.controller = controller;
      this._botControllers.set(gameId, controller);

      // регистрация бота в системах игры
      this._stat.addUser(gameId, participant.teamId, {
        name: participant.name,
        status: 'dead',
        latency: 'BOT',
      });
      this._panel.addUser(gameId);

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
      ? this._participants.getBots().filter(bot => bot.team === teamName)
      : this._participants.getBots();

    botsToRemove.forEach(bot => this._removeBotById(bot.gameId));
  }

  /**
   * @description Заполняет пространственную сетку объектами игроков.
   * Перед заполнением сетка очищается.
   * @param {Array} playerList - Массив игроков для вставки в сетку.
   */
  buildSpatialGrid(playerList = []) {
    this._spatialManager.clear();

    for (let i = 0; i < playerList.length; i += 1) {
      this._spatialManager.insert(playerList[i]);
    }
  }

  /**
   * @description Очищает все объекты из пространственной сетки.
   */
  clearSpatialGrid() {
    this._spatialManager.clear();
  }

  /**
   * @description Удаляет конкретного бота по его ID.
   * @param {string} gameId - Идентификатор бота для удаления.
   * @private
   */
  _removeBotById(gameId) {
    const participant = this._participants.get(gameId);

    if (!participant || !participant.isBot) {
      return;
    }

    const controller = this._botControllers.get(gameId);

    if (controller) {
      controller.destroy();
      this._botControllers.delete(gameId);
    }

    // удаление бота из систем игры
    this._stat.removeUser(gameId, participant.teamId);
    this._panel.removeUser(gameId);
    this._game.removePlayer(gameId);

    // удаление из реестра (команда + список активных)
    this._participants.remove(gameId);
  }

  /**
   * @description Удаляет одного бота из указанной команды,
   * чтобы освободить место.
   * @param {string} teamName - Имя команды.
   * @returns {boolean} - true, если бот был удален, иначе false.
   */
  removeOneBotForPlayer(teamName) {
    for (const bot of this._participants.getBots()) {
      if (bot.team === teamName) {
        this._removeBotById(bot.gameId);
        return true;
      }
    }

    return false;
  }

  /**
   * @description Возвращает участника-бота по gameId.
   * @param {string} gameId
   * @returns {BotParticipant | undefined} - бот или undefined,
   * если нет такого бота
   */
  getBotById(gameId) {
    const participant = this._participants.get(gameId);

    return participant && participant.isBot ? participant : undefined;
  }

  /**
   * @description Возвращает массив всех ботов.
   * @returns {BotParticipant[]}
   */
  getBots() {
    return this._participants.getBots();
  }

  /**
   * @description Возвращает количество ботов в игре.
   * @returns {number} Количество ботов.
   */
  getBotCount() {
    return this._participants.getBots().length;
  }

  /**
   * @description Возвращает количество ботов в указанной команде.
   * @param {string} teamName - Имя команды для подсчета.
   * @returns {number} Количество ботов в команде.
   */
  getBotCountForTeam(teamName) {
    return this._participants.getBots().filter(bot => bot.team === teamName)
      .length;
  }

  /**
   * @description Подсчитывает текущее количество ботов в каждой команде.
   * @returns {object} Объект, где ключ - название команды,
   * значение - количество ботов.
   */
  getBotCountsPerTeam() {
    const counts = {};

    for (const bot of this._participants.getBots()) {
      counts[bot.team] = (counts[bot.team] || 0) + 1;
    }

    return counts;
  }
}

export default BotManager;
