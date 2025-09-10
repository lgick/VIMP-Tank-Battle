const TECH_CODES = {
  sendMap: [2],
  kickIdle: [4],
  kickForMaxLatency: [5],
  kickForMissedPings: [6],
};

export default class SocketManager {
  constructor(ports, game, panel, stat) {
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

    this._game = game;
    this._panel = panel;
    this._stat = stat;

    this._senders = new Map();
    this._closers = new Map();
  }

  addUser(gameId, socket) {
    this._senders.set(gameId, socket.send.bind(socket));
    this._closers.set(gameId, socket.close.bind(socket));
  }

  removeUser(gameId) {
    this._senders.delete(gameId);
    this._closers.delete(gameId);
  }

  close(gameId, code) {
    this._closers.get(gameId)(code);
  }

  sendPing(gameId, pingIdCounter) {
    this._senders.get(gameId)(this._PORT_PING, pingIdCounter);
  }

  sendClear(gameId, setIdList) {
    if (setIdList) {
      this._senders.get(gameId)(this._PORT_CLEAR, setIdList);
    } else {
      this._senders.get(gameId)(this._PORT_CLEAR);
    }
  }

  sendTechInform(gameId, key) {
    if (key) {
      this._senders.get(gameId)(this._PORT_TECH_INFORM_DATA, TECH_CODES[key]);
    } else {
      this._senders.get(gameId)(this._PORT_TECH_INFORM_DATA);
    }
  }

  sendMap(gameId, mapData) {
    this._senders.get(gameId)(this._PORT_MAP_DATA, mapData);
  }

  sendFirstShot(gameId) {
    this._senders.get(gameId)(this._PORT_FIRST_SHOT_DATA, [
      this._game.getFullPlayersData(), // game
      0, // coords
      this._panel.getEmptyPanel(), // panel
      this._stat.getFull(), // stat
      0, // chat
      0,
      0, // keySet: 0 (наблюдатель)
    ]);
  }

  sendFirstVote(gameId) {
    this._senders.get(gameId)(this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      0, // panel
      0, // stat
      0, // chat
      'firstVote', // vote: опрос выбора команды
    ]);
  }

  sendShot(gameId, shotData) {
    this._senders.get(gameId)(this._PORT_SHOT_DATA, shotData);
  }

  sendPlayerDefaultShot(gameId) {
    this._senders.get(gameId)(this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      this._panel.getFullPanel(gameId), // panel
      0, // stat
      0, // chat
      0, // vote
      1, // keySet
    ]);
  }

  sendSpectatorDefaultShot(gameId) {
    this._senders.get(gameId)(this._PORT_SHOT_DATA, [
      {}, // game
      0, // coords
      this._panel.getEmptyPanel(), // panel
      0, // stat
      0, // chat
      0, // vote
      0, // keySet
    ]);
  }

  sendRoundStart() {
    for (const send of this._senders.values()) {
      send(this._PORT_SOUND_DATA, 'roundStart');
      send(this._PORT_GAME_INFORM_DATA, [1]);
    }
  }

  sendRoundEnd(winnerTeam) {
    let informData;

    if (winnerTeam) {
      informData = [0, [winnerTeam]];
    } else {
      informData = [2];
    }

    for (const send of this._senders.values()) {
      send(this._PORT_GAME_INFORM_DATA, informData);
    }
  }

  sendVictory(gameId) {
    this._senders.get(gameId)(this._PORT_SOUND_DATA, 'victory');
  }

  sendDefeat(gameId) {
    this._senders.get(gameId)(this._PORT_SOUND_DATA, 'defeat');
  }

  sendName(gameId, name) {
    this._senders.get(gameId)(this._PORT_MISC, {
      key: 'localstorageNameReplace',
      value: name,
    });
  }

  sendFragSound(gameId) {
    this._senders.get(gameId)(this._PORT_SOUND_DATA, 'frag');
  }
}
