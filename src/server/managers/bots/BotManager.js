import { Vec2 } from 'planck';
import BotController from './BotController.js';
import NavigationSystem from './NavigationSystem.js';
import SpatialManager from './SpatialManager.js';

// размер ячейки 600 (чуть больше MAX_FIRING_DISTANCE 500 у ботов)
const SPATIAL_CELL_SIZE = 600;

/**
 * @class BotManager
 * @description Управляет жизненным циклом ботов в игре:
 * создание, удаление и хранение их данных.
 */
class BotManager {
  /**
   * @param {object} parts - Данные моделей и оружия игры.
   * @param {UserManager} userManager - Состояние игроков.
   * @param {Game} game - Экземпляр игрового движка (физика).
   * @param {Panel} panel - Экземпляр менеджера панели игрока.
   * @param {Stat} stat - Экземпляр менеджера статистики.
   */
  constructor(parts, userManager, game, panel, stat) {
    this._models = parts.models;
    this._weapons = parts.weapons;

    this._userManager = userManager;

    this._game = game;
    this._panel = panel;
    this._stat = stat;

    this._model = 'm1'; // модель танка для ботов
    this._bots = new Map();
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

    for (const [gameId, controller] of this._botControllers) {
      if (this._userManager.isAlive(gameId)) {
        controller.update(dt);
      }
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
   * @description Проверяет наличие ресурсов для огня
   * @param {number} gameId - Идентификатор бота.
   * @param {string} weaponName - Название оружия.
   * @param {number} value - Требуемое количество.
   * @returns {boolean}
   */
  hasResources(gameId, weaponName, value) {
    return this._panel.hasResources(gameId, weaponName, value);
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

    const playableTeams = Object.keys(this._userManager.teams).filter(
      t => t !== this._userManager.spectatorTeam,
    );

    let createdCount = 0;

    for (let i = 0; i < count; i += 1) {
      if (this._userManager.isServerFull()) {
        break;
      }

      if (!teamName) {
        // логика равномерного распределения
        teamName = playableTeams.sort((a, b) => {
          const sizeA = this._userManager.teamSizes[a]?.size || 0;
          const sizeB = this._userManager.teamSizes[b]?.size || 0;
          return sizeA - sizeB;
        })[0];
      }

      if (
        !teamName ||
        !this._respawns[teamName] ||
        this._userManager.teamSizes[teamName].size >=
          this._respawns[teamName].length
      ) {
        // нет свободных мест в команде, или команда не найдена
        continue;
      }

      // генерация ID и имени
      const gameId = this._userManager.createGameId();
      const name = this._userManager.checkName(`Bot${i}`);
      const teamId = this._userManager.teams[teamName];
      const botData = {
        gameId,
        name,
        team: teamName,
        teamId,
        modelData: this._models[this._model],
        model: this._model,
        isBot: true,
      };

      // контроллер для бота
      const controller = new BotController(this, this._game, botData);

      this._botControllers.set(gameId, controller);
      this._bots.set(gameId, botData);

      // регистрация бота в системах игры
      this._stat.addUser(gameId, teamId, {
        name,
        status: 'dead',
        latency: 'BOT',
      });
      this._panel.addUser(gameId);

      // обновление размера команды
      this._userManager.teamSizes[teamName].add(gameId);

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

    botsToRemove.forEach(gameId => this._removeBotById(gameId));
  }

  /**
   * @description Ищет ближайшего живого врага.
   * @param {number} gameId - gameId игрока.
   * @param {number} teamId - teamId игрока.
   * @param {Vec2} vec2 - Координаты центра поиска.
   * @returns {object | null} - Данные врага или null.
   */
  findClosestEnemy(gameId, teamId, vec2) {
    const candidates = this._spatialManager.queryNearby(vec2.x, vec2.y);
    let closestEnemy = null;
    let minDistanceSq = Infinity;

    for (const candidate of candidates) {
      const candidateGameId = candidate.gameId;
      if (candidateGameId === gameId || candidate.teamId === teamId) {
        continue;
      }

      const distanceSq = Vec2.distanceSquared(
        vec2,
        new Vec2(candidate.x, candidate.y),
      );

      if (distanceSq < minDistanceSq) {
        minDistanceSq = distanceSq;
        closestEnemy =
          this._userManager.users.get(candidateGameId) ||
          this.getBotById(candidateGameId);
      }
    }

    return closestEnemy;
  }

  /**
   * @description Заполняет пространственную сетку объектами игроков.
   * Перед заполнением сетка очищается.
   */
  buildSpatialGrid() {
    this._spatialManager.clear();

    this._userManager.forEachAlivePlayer(user => {
      const gameId = user.gameId;
      const vec2Pos = this._game.getPosition(gameId);

      this._spatialManager.insert(gameId, user.teamId, vec2Pos.x, vec2Pos.y);
    });
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
    const botData = this._bots.get(gameId);

    if (!botData) {
      return;
    }

    const controller = this._botControllers.get(gameId);

    if (controller) {
      controller.destroy();
      this._botControllers.delete(gameId);
    }

    // удаление бота из систем игры
    this._stat.removeUser(gameId);
    this._panel.removeUser(gameId);

    this._userManager.teamSizes[botData.team].delete(gameId);

    this._game.removePlayer(gameId);
    this._bots.delete(gameId);
  }

  /**
   * @description Удаляет одного бота из указанной команды,
   * чтобы освободить место.
   * @param {string | undefined} teamName - Имя команды.
   * @returns {boolean} - true, если бот был удален, иначе false.
   */
  removeOneBotForPlayer(teamName) {
    for (const botData of this._bots.values()) {
      if (teamName) {
        if (botData.team === teamName) {
          this._removeBotById(botData.gameId);

          return true;
        }
      } else {
        this._removeBotById(botData.gameId);

        return true;
      }
    }

    return false;
  }

  /**
   * @description Возвращает botData по gameId
   * @param {string} gameId
   * @returns {object | undefined} - botData или undefined,
   * если нет такого gameId
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

  getBotIds() {
    return this._bots.keys();
  }

  /**
   * @description Возвращает количество ботов в игре.
   * @returns {number} Количество ботов.
   */
  getBotCount() {
    return this._bots.size;
  }

  /**
   * @description Возвращает количество ботов в указанной команде.
   * @param {string} teamName - Имя команды для подсчета.
   * @returns {number} Количество ботов в команде.
   */
  getBotCountForTeam(teamName) {
    return [...this._bots.values()].filter(bot => bot.team === teamName).length;
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
