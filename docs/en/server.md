# Server modules and systems

The server: Node.js + Express + `ws` + ViteExpress. The entry point is [src/server/main.js](../../src/server/main.js) (assembling configs, the HTTP/HTTPS server, connecting the WebSocket layer). An overview of how the modules interact is in [architecture.md](architecture.md).

## VIMP — the facade

[src/server/modules/VIMP.js](../../src/server/modules/VIMP.js) (singleton, ~530 lines) — wiring of all modules + delegation. It itself contains only:

- **the connection lifecycle**: `createUser` (registering a spectator in all modules), `removeUser`, `mapReady`, `firstShotReady`, `sendMap` (a proxy to RoundManager);
- **input**: `updateKeys(gameId, 'seq:action:name')` — stores `lastInputSeq`, for a spectator switches the observed player, for a player passes it to `Game.updateKeys`;
- **chat/votes**: `pushMessage` (sanitization, length limit, `/commands` → CommandProcessor), `parseVote` (requests for `maps`/`teams` lists, map/team change, accepting a vote);
- **the tick** `_onShotTick(dt)`: physics → bots → snapshot (`SnapshotManager.processTick`) → `packBody` once → per-user `packFrame` (camera + player block) → sending the frame and meta (panel/stat/chat/vote — only on change);
- **callback bridges** `TimerManager`/`RTTManager`: kicks for idle/latency/missed pings, ping broadcasting;
- `reportKill`, `triggerCameraShake`, `updateRTT`.

Business logic is extracted into managers (below); dependencies are passed via constructors (DI).

## ParticipantManager — the participant registry

[src/server/player/](../../src/server/player/) — the **single source of truth about participants** (humans + bots):

- classes `Participant` (base: `gameId`, `name`, `model`, `team`, `teamId`, `status`) → `HumanParticipant` (`socketId`, `isReady`, `currentMap`, `isWatching`, `watchedGameId`, `forceCameraReset`, `pendingShake`, `lastActionTime`, `lastInputSeq`) and `BotParticipant` (a reference to `BotController`);
- the bot/human distinction is the getters `isBot`/`isNetworked`, **not** the id format: humans and bots share a single numeric id space (the generator picks the smallest free id);
- API: `createHuman`/`createBot`/`remove`/`get`/`getAll`/`getHumans`/`getBots`/`getNetworkedReady` (ready to be broadcast to), `checkName` (name deduplication), team sizes (`getTeamSize`/`addToTeam`/`resetTeamSizes`), the active-for-observation list (`addActive`/`removeActive`/`getActiveList`/`replaceWatched`), the `maxPlayers` limit (`totalCount`).

## core/ managers

[src/server/core/](../../src/server/core/) — logic extracted from VIMP:

### RoundManager

Rounds, teams, maps. Owns state: `currentMap`, `currentMapData`, `scaledMapData`, `isRoundEnding`, `removedPlayersList`.

- `createMap()` — stopping timers, resetting Panel/Stat/Vote and teams, recreating the world, `CLEAR` to everyone, everyone to spectators, broadcasting the map, restarting timers, recreating bots;
- `initiateNewRound()`/`_startRound()` — clearing the active list, recreating the map in Game, applying a deferred team change, the default panel, a full stat, keySet by status, respawns and tank creation;
- `changeTeam(gameId, team)` — with a free-respawn check (may displace a bot), a grace period at the start of a round, otherwise — a change from the next round;
- `changeName`, `changeMap` (a player's map vote), `forceChangeMap`, `onMapTimeEnd` (a timer-based vote for the next map; if nobody voted — extending the current one);
- `reportKill(victimId, killerId)` — statistics (frags/deaths/friendly fire), moving spectators to the killer, `_checkTeamWipe` → ending the round (victory to the team, victory/defeat sounds, restart via `roundRestartDelay`);
- `setActive`/`setSpectator` — player↔spectator transitions with keySet and panel sending.

### CommandProcessor

Parsing chat commands (messages starting with `/`): `/name <nick>`, `/timeleft`, `/mapname`, `/nr` (new round, **dev mode only**), `/bot`:

```
/bot 5 team1   # create 5 bots in team1
/bot 10        # create 10 bots evenly distributed
/bot 0 team2   # remove team2 bots
/bot 0         # remove all bots
```

`/bot` is available only to active players; if there is more than one active human — instead of immediate execution a vote is started (the `botManagement` category). An unknown command — the system message "Command not found".

### VoteCoordinator

Creating votes on top of the `Vote` module: `canCreateVote` (checking a topic's cooldown), `createVote` (payload + result callback + participant list), `reset`. A topic's cooldown is `timeBlockedVote` (30 s).

## Game — the physical world

[src/server/modules/Game.js](../../src/server/modules/Game.js) (singleton) — authoritative physics on **Rapier 2D** (`@dimforge/rapier2d-compat`, WASM). WASM is initialized with top-level await in [src/server/physics/rapier.js](../../src/server/physics/rapier.js) — the single Rapier import point (all constructors stay synchronous).

- **Fixed step**: `updateData(dt)` accumulates time and steps exactly by `timeStep` (spiral-of-death protection under lag); contacts are collected from the `EventQueue` after each `world.step`;
- **players**: `createPlayer`/`removePlayer`/`updateKeys`/`getPosition`/`changePlayerData`/`getAlivePlayers`/`isAlive`; a data cache for the snapshot (`getPlayersData`), `getPredictionState(gameId)` — the exact tank state for the player block;
- **damage**: `applyDamage(target, shooter, weapon, value?)` — friendly fire per config, camera shake, on death — `vimp.reportKill`;
- **projectiles**: a registry of active bullets/bombs, a ring buffer of lifetimes, completion effects (`w2e`), `getDynamicMapData` — map dynamics for the snapshot;
- `clear()` — a full world cleanup (the map and projectiles remove their bodies first: a repeated `removeRigidBody` crashes Rapier WASM).

### Physical parts (src/server/parts/)

- **`BaseModel`** — the base of models: a queue of pressed keys (`updateKeys`/`getKeysForProcessing`), the getters `gameId`/`teamId`/`name`/`model`/`currentWeapon`.
- **`Tank`** — the tank movement model: throttle/braking impulses, velocity clamp to `maxForwardSpeed`/`maxReverseSpeed`, lateral grip (`lateralGrip`), turning that accounts for speed, the turret (`gunRotation`, centering), `getData()` → `[x, y, angle, gunRotation, vx, vy, engineLoad, condition, size, teamId]` (`condition`: 3/2/1/0 — state/death), `getMuzzlePosition`/`getFireDirection` — replicated by the client's `ShotPredictor`. ⚠️ Changes to `Tank.updateData` and the `models.js` coefficients must be accompanied by an update to the client replica — the parity test `tests/server/TankPredictorParity.test.js` catches this.
- **`Bomb`** — the physical `w2` projectile: a body in the Rapier world, a detonation timer, an explosion with radius damage, snapshot data (with `ownerId`).
- **`Map`** — map bodies: static from `physicsStatic` tiles, dynamic objects `physicsDynamic` (sent in the snapshot as `c1`/`c2`), `destroyMap`.
- **`HitscanService`** — the instant `w1` shot computation: `world.castRay` (sensors excluded), target damage, tracer data `[startX, startY, endX, endY, bodyX, bodyY, wasHit, shooterId]`.

## Meta modules

- **`Panel`** ([Panel.js](../../src/server/modules/Panel.js)) — per-user HUD: values from `game:panel` (health/w1/w2), `updateUser(gameId, param, value, op)` accumulating `pendingChanges`, `processUpdates()` once per snapshot tick returns only the changes (`'key:value'` strings, round time `t` — when the second changes), `getFullPanel`/`getEmptyPanel`, `setActiveWeapon` (`wa`), `hasResources`/`getCurrentValue` — the authoritative ammo check.
- **`Stat`** ([Stat.js](../../src/server/modules/Stat.js)) — the scoreboard: rows (body) and team totals (head) per the `game:stat` config; `addUser`/`removeUser`/`moveUser`/`updateUser`/`updateHead`; `getLast()` — the per-tick delta, `getFull()` — the full state (on entry).
- **`Chat`** ([modules/chat/](../../src/server/modules/chat/)) — user messages and system templates ([systemMessages.js](../../src/server/modules/chat/systemMessages.js)): `push` (broadcast), `pushSystem`/`pushSystemByUser` (templated `'group:number:params'`), the `shift`/`shiftByUser` queues.
- **`Vote`** ([Vote.js](../../src/server/modules/Vote.js)) — vote mechanics: a queue (a new vote during an active one is not rejected but waits), the `voteTime` lifetime, list pagination (more than 7 options — Back/More pages), tie resolution by random choice, personal deliveries (`pushByUser`/`shiftByUser`), `addInVote`, `getResult`.

## Infrastructure

- **`TimerManager`** ([TimerManager.js](../../src/server/modules/TimerManager.js)) — all game timers: the game loop (`onShotTick`, ~120 Hz), the round (`onRoundTimeEnd`), the map (`onMapTimeEnd`), RTT pings, the idle check, deferred calls (round restart, map change); `getRoundTimeLeft`/`getMapTimeLeft`.
- **`SnapshotManager`** ([SnapshotManager.js](../../src/server/modules/SnapshotManager.js)) — snapshot throttling: `processTick()` returns a world snapshot only every `networkSendRate`-th tick, otherwise `null`.
- **`RTTManager`** ([RTTManager.js](../../src/server/modules/RTTManager.js)) — ping accounting: `scheduleNextPing()` (who to send to and with which id), `handlePong` (latency computation), kick callbacks on `maxLatency`/`maxMissedPings`.
- **`SocketManager`** ([socket/SocketManager.js](../../src/server/socket/SocketManager.js)) — the single send point: JSON `_send(socketId, port, data)` and binary `sendShot(socketId, frameBuffer)`; typed methods (`sendConfig`, `sendMap`, `sendPanel`, `sendStat`, `sendChat`, `sendVote`, `sendKeySet`, `sendRoundStart`, `sendTechInform`, …) and `close` with a technical code. Composite sends: `sendFirstShot` (first frame + full stat + empty panel + keySet 0), `sendPlayerDefaultShot`/`sendSpectatorDefaultShot`.
- **The WebSocket layer** ([socket/index.js](../../src/server/socket/index.js)) — accepting connections: origin check, `oneConnection`, the full-server queue, staged activation of client ports, routing incoming messages into VIMP. Protocol details are in [network.md](network.md).

## Bots (src/server/modules/bots/)

Bots are functionally identical to players: the same record in `ParticipantManager`, the same `Tank` in Game, the same `updateKeys` path; the difference is the input source (AI instead of WebSocket) and the absence of a socket.

- **`BotManager`** ([bots/index.js](../../src/server/modules/bots/index.js) / `BotManager.js`) — creating/removing bots (records are in ParticipantManager, only controllers here), `updateBots(dt)` per tick, `buildSpatialGrid`, counts (`getBotCount`, `getBotCountForTeam`).
- **`BotController`** — one bot's AI: target selection, shooting, driving; it takes data through `ParticipantManager`/`BotManager`, not through VIMP's private fields.
- **`NavigationSystem`** + **`Pathfinder`** — building routes over the map grid (pathfinding), obstacle avoidance.
- **`SpatialManager`** — a spatial grid for fast "who is nearby" queries.

Added with the `/bot` command or by vote; when there are not enough respawns for a human, a bot may be displaced (see RoundManager).
