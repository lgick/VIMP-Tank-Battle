# Gameplay

Team tank deathmatch: two teams (`team1`, `team2`) destroy each other in rounds, and a third "team" is the spectators (`spectators`). All rules are authoritative on the server.

## Player journey

1. **Connection and authorization** — the player enters a name (and a tank model); the name is checked by a validator and deduplicated by the server. When the server is full (`maxPlayers`, humans + bots) — a queue with an on-screen position.
2. **Spectator** — after the map loads, the player enters the game as a spectator: sees the world, the camera follows the observed player, the `n`/`p` keys switch the observation target. The team-selection window appears immediately.
3. **Team selection** — via the vote menu (`m` → Switch team). If a team has no free respawns, the server tries to displace a bot; otherwise — a refusal ("Team ... is full").
4. **Playing** — at the start of a round the player receives a tank at a respawn. During the first `teamChangeGracePeriod` (10 s) of a round a team change applies immediately; later — the player finishes the round (or goes to spectators) and the change takes effect from the next round.
5. **Death** — the player becomes a spectator until the end of the round, the camera switches to the killer.

## Rounds and victory

- **A round** lasts `roundTime` (2 minutes by default). Victory is a **team wipe**: destroying all members of the opposing team (bots count). The winning team gets a team frag (`score +1` in the header), the losing one a loss (`deaths +1`); everyone hears victory/defeat and sees "{team} WINS!".
- If the round time expires without a winner — a new round starts without awarding points.
- Between rounds there is a `roundRestartDelay` (5 s) pause. At the start of a round the world is recreated: everyone is alive, the panel holds default values, respawns are distributed by team.
- **A map** lives `mapTime` (10 minutes). When it expires, the server automatically starts a vote for the next map (`mapsInVote` options); if nobody voted, the current map's time is extended.

## Statistics (Tab)

Scoring rules ([RoundManager.reportKill](../../src/server/core/RoundManager.js)):

1. The destroyed player gets a loss (`deaths +1`) and the `dead` status until the end of the round.
2. The player who destroyed an opponent gets a frag (`score +1`).
3. A player who destroys someone on **their own** team loses a frag (`score −1`).
4. Suicide — only a loss (`deaths +1`), frags are unchanged.
5. For a team wipe, the winning team gets `score +1`, the losing one `deaths +1` (totals in the table header).
6. The `latency` column is the player's current RTT (empty for bots).

Statistics changes are broadcast the moment they occur; table sorting is done on the client (`score` descending, then `deaths` ascending).

## Votes (key `m`)

A collective-decision system ([Vote](../../src/server/modules/Vote.js) + [VoteCoordinator](../../src/server/core/VoteCoordinator.js)):

- **Menu** — a window with the items "Switch team" and "Suggest map".
- **Started by a player or the system** — a map suggestion by a player (if the player is the only one in the game — the map changes immediately, without a vote), a vote for bots, an automatic timer-based map selection.
- **Queue** — a vote created while another is active is queued and started afterwards.
- **Cooldown** — after a vote on a topic, a `timeBlockedVote` (30 s) block against spam is in effect.
- **Lifetime** — `voteTime` (10 s); windows with `timeOff: true` (the menu) do not close on a timer.
- **Pagination** — lists longer than 7 are split into pages (Back/More).
- **Ties** — the winner is chosen at random among those with the maximum.

The exchange format is in [network.md](network.md#vote-port-16).

## Chat (key `c`) and commands

Plain text is a message to the team/everyone (length limited by the server, 60 characters). Messages starting with `/` are commands ([CommandProcessor](../../src/server/core/CommandProcessor.js)):

| Command | Action |
| --- | --- |
| `/name <nick>` | Change name (with a check and a system message) |
| `/timeleft` | Remaining map time |
| `/mapname` | Current map name |
| `/bot <N> [team]` | Create N bots (into a team or evenly distributed); `/bot 0 [team]` — remove bots |
| `/nr` | New round — **dev mode only** |

`/bot` is available only to active players. If there is more than one active human, instead of immediate execution a vote is started; executing the command restarts the round.

## Controls

The server switches key sets by status (spectator/player):

- **Spectator**: `n` — next player, `p` — previous.
- **Player**: `w/s` — throttle/reverse, `a/d` — turn, `k/l` — turn the turret, `u` — turret to center, `j` — fire, `n/p` — next/previous weapon.
- **Modes** (in any status): `c` — chat, `m` — vote, `Tab` — statistics; `Esc`/`Enter` — control inside the modes.

The layout is configured in `client.js` (`modules.controls`); commands and their types are in `game.js` (`playerKeys`), see [configuration.md](configuration.md#keys-spectatorkeys-playerkeys).

## Weapons and the tank

The tank has two weapons (switching with `n`/`p`, the active one is highlighted on the panel):

- **`w1` — bullet (hitscan)**: an instant ray, 40 damage, range 1500, ammo 200. The server computes the hit with a ray; the client draws the tracer immediately.
- **`w2` — bomb (explosive)**: a physical projectile, placed and detonated after a timer; 70 damage at the epicenter with falloff over a radius of 50, ammo 100.

Health is 100. The tank's state (`condition`) degrades visually with damage (smoke); at 0 the tank is destroyed. Characteristics are in [configuration.md](configuration.md#srcdata--game-data).

## HUD panel

Left to right: round time, health, `w1`/`w2` ammo (the active weapon is highlighted). Values are hidden for a spectator (an empty panel). Values reset to defaults every round.

## Bots

Server-side AI ([src/server/modules/bots/](../../src/server/modules/bots/)): full-fledged participants — they take `maxPlayers` slots, appear in statistics, drive tanks and shoot through the same input as players. Navigation — pathfinding over the map grid + a spatial grid for finding targets. Added with `/bot` or by vote; when a human joins a full team, a bot may be displaced.

## Kicks

- **Inactivity**: a player without input/chat for longer than `idleKickTimeout.player` (2 min) is kicked (spectators are not, `null` by default).
- **Network**: an RTT above `maxLatency` (300 ms) or `maxMissedPings` (5) missed pings in a row — the connection is closed with a technical message.

## Maps

`pool mini`, `canopy`, `garden` are tile maps with per-team respawns, static geometry, and dynamic objects (sent in the snapshot). Switching is by vote or by the map timer. Adding a new one — [extending.md](extending.md#new-map).
