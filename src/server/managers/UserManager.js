import { isValidName } from '../../lib/validators.js';

let userManager;

class UserManager {
  constructor(maxPlayers, idleKickTimeout, teams, spectatorTeam) {
    if (userManager) {
      return userManager;
    }

    userManager = this;

    this._maxPlayers = maxPlayers; // максимальное количество игроков

    // таймауты
    this._idleTimeoutForPlayer = idleKickTimeout.player || Infinity;
    this._idleTimeoutForSpectator = idleKickTimeout.spectator || Infinity;

    // игроки
    this._users = new Map(); // все пользователи { gameId: UserData }
    this._readyUsers = new Set(); // gameId готовых пользователей

    this._usedNames = new Set();

    // { team1: 1, team2: 2, spectators: 3 }
    this._teamNameToId = teams;

    // ['team1', 'team2', 'spectators']
    this._teamNames = Object.keys(this._teamNameToId);

    // { 1 => 'team1', 2 => 'team2', 3 => 'spectators' }
    this._teamIdToName = new Map(
      Object.entries(this._teamNameToId).map(([name, id]) => [id, name]),
    );

    // количество игроков в командах
    // { team1: new Set(), team2: new Set(), spectators: new Set() }
    this._teamSets = this._teamNames.reduce((acc, key) => {
      acc[key] = new Set();
      return acc;
    }, {});

    // название команды наблюдателя
    this._spectatorTeam = spectatorTeam;

    // id команды наблюдателя
    this._spectatorId = this._teamNameToId[this._spectatorTeam];

    // списки активности
    // список gameId активных игроков на полотне для наблюдения
    // (только живые танки)
    this._alivePlayers = [];

    // список gameId игроков для удаления с полотна
    this._removedPlayers = [];
  }

  initializeAllUsersAsSpectators() {
    const userList = [];

    this._resetTeamSets();
    this.clearAlivePlayers();
    this._removedPlayers.length = 0;
    this._readyUsers.clear();

    for (const user of this._users.values()) {
      const gameId = user.gameId;

      userList.push({
        gameId,
        oldTeamId: user.teamId,
        newTeamId: this._spectatorId,
      });

      user.team = this._spectatorTeam;
      user.teamId = this._spectatorId;
      user.isWatching = true;
      user.watchedGameId = null; // все пользователи - наблюдатели, поэтому null
      user.forceCameraReset = true;
      user.idleThreshold = this._idleTimeoutForSpectator;

      this._teamSets[this._spectatorTeam].add(gameId);
    }

    return userList;
  }

  setUserReady(gameId) {
    this._readyUsers.add(gameId);
  }

  isUser(gameId) {
    return this._users.has(gameId);
  }

  isUserReady(gameId) {
    return this._readyUsers.has(gameId);
  }

  forEachSnapshotTarget(callback) {
    for (const gameId of this._readyUsers) {
      const user = this._users.get(gameId);
      let watchingId;

      if (user.isWatching) {
        watchingId = user.watchedGameId ?? this._alivePlayers[0];
      } else {
        watchingId = user.gameId;
      }

      const shake = user.pendingShake || 0;
      const reset = user.forceCameraReset ? 1 : 0;

      // сброс флагов после чтения
      if (user.pendingShake) {
        user.pendingShake = 0;
      }

      if (user.forceCameraReset) {
        user.forceCameraReset = false;
      }

      callback(gameId, watchingId, shake, reset);
    }
  }

  forEachReadyUser(fn) {
    for (const gameId of this._readyUsers) {
      fn(this._users[gameId]);
    }
  }

  forEachReadyUserId(fn) {
    for (const gameId of this._readyUsers) {
      fn(gameId);
    }
  }

  getReadyUsersWithout(gameId) {
    const arr = [];

    for (const userGameId of this._readyUsers) {
      if (userGameId !== gameId) {
        arr.push(userGameId);
      }
    }

    return arr;
  }

  getUser(gameId) {
    return this._users.get(gameId);
  }

  getReadyUser(gameId) {
    if (this._readyUsers.has(gameId)) {
      return this._users.get(gameId);
    }
  }

  getUserCount(predicate = () => true) {
    let count = 0;

    for (const user of this._users.values()) {
      if (predicate(user)) {
        count += 1;
      }
    }

    return count;
  }

  getUserName(gameId) {
    return this._users.get(gameId).name;
  }

  getUserTeam(gameId) {
    return this._users.get(gameId).team;
  }

  getUserTeamData(gameId) {
    const { team, teamId } = this._users.get(gameId);

    return { team, teamId };
  }

  getTeamList() {
    return this._teamNames;
  }

  getTeamId(team) {
    return this._teamNameToId[team];
  }

  getTeamName(id) {
    return this._teamIdToName.get(id);
  }

  getTeamSize(team) {
    return this._teamSets[team].size;
  }

  activateCameraShake(gameId, shakeParams) {
    const user = this._users.get(gameId);

    user.pendingShake = `${shakeParams.intensity}:${shakeParams.duration}`;
  }

  setUserMap(gameId, mapName) {
    this._users.get(gameId).currentMap = mapName;
  }

  addUser(gameId, params) {
    const name = this._checkName(params.name);

    const data = {
      // gameId игрока
      gameId,
      // текущая карта игры
      currentMap: null,
      // имя пользователя
      name,
      // модель игрока
      model: params.model,
      // название команды
      team: this._spectatorTeam,
      // id команды
      teamId: this._spectatorId,
      // флаг наблюдателя за игрой
      // (true у игроков, которые в текущий момент наблюдают за игрой)
      isWatching: true,
      // id наблюдаемого игрока
      watchedGameId: this._alivePlayers[0] ?? null,
      // флаг для сброса камеры клиента
      forceCameraReset: true,
      // данные для тряски камеры
      pendingShake: null,
      // фиксация времени активности пользователя
      lastActionTime: Date.now(),
      // порог бездействия
      idleThreshold: this._idleTimeoutForSpectator,
      // флаг реального игрока
      isBot: false,
    };

    this._usedNames.add(name);
    this._users.set(gameId, data);
    this._teamSets[data.team].add(data.gameId);

    return data;
  }

  removeUser(gameId) {
    const user = this._users.get(gameId);

    if (!user) {
      return null;
    }

    // удаление из счетчиков команд
    this._teamSets[user.team].delete(gameId);

    // удаление из списка активных (если был)
    this.removeFromAlivePlayers(gameId);
    this._usedNames.delete(user.name);
    this._readyUsers.delete(gameId);

    // если это был игрок (не наблюдатель),
    // добавляем в список "на удаление с клиента"
    if (user.team !== this._spectatorTeam) {
      this.addToRemovedPlayers(gameId, user.model);
    }

    this._users.delete(gameId);

    return user;
  }

  _checkName(name) {
    if (!this._usedNames.has(name)) {
      return name;
    }

    let index = 1;
    let candidate;

    // цикл подбора свободного суффикса
    do {
      candidate = `${name}#${index}`;
      index += 1;
    } while (this._usedNames.has(candidate));

    return candidate;
  }

  changeUserName(gameId, name) {
    const user = this._users.get(gameId);
    const oldName = user.name;

    if (isValidName(name)) {
      const newName = this._checkName(name);

      this._usedNames.delete(oldName);
      this._usedNames.add(newName);

      user.name = newName;
    }
  }

  changeTeamSets(gameId, newTeam, oldTeam) {
    this._teamSets[newTeam].add(gameId);
    this._teamSets[oldTeam].delete(gameId);
  }

  changeUserTeam(gameId, newTeam) {
    const user = this._users.get(gameId);

    user.team = newTeam;
    user.teamId = this._teamNameToId[newTeam];

    return user.teamId;
  }

  _resetTeamSets() {
    for (const key in this._teamSets) {
      this._teamSets[key].clear();
    }
  }

  _addToAlivePlayers(gameId) {
    if (!this._alivePlayers.includes(gameId)) {
      this._alivePlayers.push(gameId);
    }
  }

  getHumanPlayerCount() {
    let count = 0;

    for (const user of this._users.values()) {
      if (!user.isBot && user.teamId !== this._spectatorId) {
        count += 1;
      }
    }

    return count;
  }

  getAlivePlayerCountByTeam(team) {
    let count = 0;

    for (const gameId of this._alivePlayers) {
      const user = this._users.get(gameId);
      if (user.team === team) {
        count += 1;
      }
    }

    return count;
  }

  getPlayerCountWithout(gameId) {
    let size = 0;
    const user = this._users.get(gameId);

    for (const team in this._teamSets) {
      if (team === this._spectatorTeam) {
        continue;
      }

      size += this._teamSets[team].size;
    }

    if (user && user.team !== this._spectatorTeam) {
      size -= 1;
    }

    return size;
  }

  removeFromAlivePlayers(gameId, watchedGameId) {
    const index = this._alivePlayers.indexOf(gameId);

    if (index !== -1) {
      this._alivePlayers.splice(index, 1);
    }

    if (!watchedGameId || !this._alivePlayers.includes(watchedGameId)) {
      watchedGameId = this._alivePlayers[0] ?? null;
    }

    // обновление наблюдателей (если они смотрели за удаленным)
    for (const user of this._users.values()) {
      if (user.watchedGameId === gameId) {
        user.watchedGameId = watchedGameId;
        user.forceCameraReset = true;
      }
    }
  }

  clearAlivePlayers() {
    this._alivePlayers.length = 0;
  }

  getNextAlivePlayerForUser(gameId, back) {
    const user = this._users.get(gameId);

    if (!user) {
      return null;
    }

    const watchedGameId = user.watchedGameId;
    let key = this._alivePlayers.indexOf(watchedGameId);

    // если есть наблюдаемый игрок
    if (key !== -1) {
      // если поиск назад
      key = back ? key - 1 : key + 1;

      if (key < 0) {
        key = this._alivePlayers.length - 1;
      } else if (key >= this._alivePlayers.length) {
        key = 0;
      }

      user.watchedGameId = this._alivePlayers[key];
    } else {
      user.watchedGameId = this._alivePlayers[0] ?? null;
    }

    user.forceCameraReset = true;
  }

  touchUserActivity(gameId) {
    this._users.get(gameId).lastActionTime = Date.now();
  }

  addToRemovedPlayers(gameId, model) {
    this._removedPlayers.push({ gameId, model });
  }

  writeRemovedPlayersToSnapshot(snapshot) {
    const removedPlayers = this._removedPlayers;
    const len = removedPlayers.length;

    // если удалять некого - мгновенный выход
    if (len === 0) {
      return;
    }

    for (let i = 0; i < len; i += 1) {
      const user = removedPlayers[i];
      const model = user.model;

      // если под этот model ещё нет объекта — создаем
      if (!snapshot[model]) {
        snapshot[model] = {};
      }

      snapshot[model][user.gameId] = null;
    }

    // очистка массива
    removedPlayers.length = 0;
  }

  getReadyUsersToKick() {
    const now = Date.now();
    const arr = [];

    for (const gameId of this._readyUsers) {
      const { lastActionTime, idleThreshold } = this._users.get(gameId);

      if (now - lastActionTime > idleThreshold) {
        arr.push(gameId);
      }
    }

    return arr;
  }

  setActivePlayer(gameId) {
    const user = this._users.get(gameId);
    const { teamId, model, name } = user;

    user.isWatching = false;
    user.watchedGameId = null;
    user.forceCameraReset = true;

    this._addToAlivePlayers(gameId);

    return { teamId, model, name };
  }

  setSpectator(gameId, watchedGameId) {
    const user = this._users.get(gameId);

    user.isWatching = true;
    user.watchedGameId = watchedGameId ?? this._alivePlayers[0] ?? null;
    user.forceCameraReset = true;
  }

  setSpectatorFromActivePlayer(gameId, watchedGameId) {
    this.setSpectator(gameId, watchedGameId);
    this.removeFromAlivePlayers(gameId, watchedGameId);
  }
}

export default UserManager;
