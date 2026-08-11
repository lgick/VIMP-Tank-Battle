# Client modules and systems

The client is a browser application built on PixiJS (a Vite build, Pug templates in [src/client/views/](../../src/client/views/)). The entry point is [src/client/main.js](../../src/client/main.js).

## main.js — the dispatcher and render loop

- Opens a WebSocket and branches incoming messages by the type of `e.data`: a string → JSON `[portId, payload]` → the `socketMethods[portId]` handler; an `ArrayBuffer` → `unpackFrame` → the `SnapshotInterpolator` buffer (a version mismatch drops the frame).
- On `CONFIG_DATA` (port 0) it initializes all modules: PixiJS `Application`s, MVC components, `BakingProvider` (texture baking), `SoundManager`, the predictors; it replies `CONFIG_READY`.
- The first frame (`FIRST_SHOT_DATA`, port 4) is applied immediately, bypassing the interpolation buffer.
- **The render loop** `renderTick` on `Ticker.shared` (rAF): the interpolator's `sample()` → applying frames/interpolation → own-tank prediction on top (`applyGameData`) → the camera.
- Resets: a map change (`MAP_DATA`) and `CLEAR` clear the interpolation buffer and the predictors.

## MVC components (src/client/components/)

Eight `model/` + `view/` + `controller/` triplets: **Auth**, **CanvasManager**, **Controls**, **Game**, **Chat**, **Panel**, **Stat**, **Vote**.

The Publisher pattern for links inside a triplet:

- `main.js` or `view` → `controller` methods are called **directly**;
- `controller` → `model` methods are called **directly**;
- `model` → `view` — **through `Publisher`** ([src/lib/Publisher.js](../../src/lib/Publisher.js)): the model publishes an event, the view is subscribed; external subscribers may also subscribe to the model.

The purpose of the components:

- **Auth** — the login form (name, model), client-side validation (`validators.js`), localStorage.
- **CanvasManager** — manages several PixiJS `Application`s at once: `vimp` (the main game canvas) and `radar` (the minimap). Adaptive scaling (a 1920px reference), `aspectRatio`/`fixSize`/`baseScale`, a dynamic camera (look-ahead, speed-based zoom) and shake — parameters in [configuration.md](configuration.md#modulescanvasmanager--canvases-and-camera).
- **Controls** — keyboard capture (`InputListener`), the active key set is dictated by the server (port 17), the `chat`/`vote`/`stat` modes, sending input as `"seq:action:name"`.
- **Game** — the rendering core: `GameCtrl.parse(name, data)` creates/updates/removes entity instances from snapshot data via `Factory`.
- **Chat** — displaying messages (line limit, lifetime), the command line; escaping on output (`textContent`).
- **Panel** — the HUD: round time, health, ammo, active weapon (from `'key:value'` strings). On round start (`GAME_INFORM_DATA` code `GAME_CODES.roundStart`, `src/config/gamecodes.js`), `main.js` calls `logoAnimation.js`'s `playLogoRoundStart()` (a CSS wave animation on `#logo`, `logo-round-start` class) and `PanelCtrl.playRoundStart()`, which fills the health bar block-by-block left to right toward the last known health value (the panel's `h:` value is not guaranteed to arrive before `roundStart`, so the view always tracks the latest value regardless of animation state, and a real health drop during the fill interrupts it immediately). Both animations respect `prefers-reduced-motion` (`src/lib/motion.js`). `PanelCtrl.reset()` is called on `PS_CLEAR` (map change) to stop the fill and forget the last known health.
- **Stat** — the scoreboard tables with sorting (`sortList`), shown on Tab.
- **Vote** — vote windows from templates, pagination, a lifetime timer.

## Network smoothing (Phases 5a–5c)

### SnapshotInterpolator

[src/client/SnapshotInterpolator.js](../../src/client/SnapshotInterpolator.js) — port-5 frames are not applied immediately but buffered; the world is rendered in the past:

- server time is estimated by an EMA offset (`serverTime − localNow`), `renderTime = serverNow − delay` (config `interpolation.delay: 100` ms);
- `sample()` emits frames crossed by `renderTime` **in full exactly once** (the `w1`/`w2e` events, creation/removal, camera reset/shake), and interpolates continuous values between adjacent frames: tanks `m1` (x/y/vx/vy/engineLoad — `lerp`, angles — `lerpAngle` from [src/lib/math.js](../../src/lib/math.js)), map dynamics `c1`/`c2`, the camera;
- keys are classified by `kind` from `SNAPSHOT_KEYS` (`opcodes.js`); there is no extrapolation — hold on the last frame; the buffer is reset on a map change and `CLEAR`.

### MapDynamics

[src/client/MapDynamics.js](../../src/client/MapDynamics.js) — the single source of map-dynamics geometry on the client: the tracer raycast in `ShotPredictor` and the hit-effect anchoring in `ShotEffectController` must see the exact same boxes, otherwise the impact point and the debris cloud diverge from each other.

- `setMap({ physicsDynamic, scale })` builds each box's half-extents from `MAP_DATA`; `update(game)` refreshes transforms from a discrete frame or an interpolated sample (`c1`/`c2` keys);
- boxes are stored **centered**, unlike the `c1`/`c2` snapshot where `[x, y, angle]` is the object's *origin* (the Rapier body position — the server collider is offset from it by `(width/2, height/2)` in the object's rotated local frame, see `src/server/parts/Map.js`); `boxCenterFromOrigin` ([src/lib/collision.js](../../src/lib/collision.js)) performs the conversion once, here, instead of every consumer repeating (and risking getting wrong) the same offset math;
- `getBox(key)`/`getBoxes()` expose the centered boxes; `toLocal(key, worldX, worldY)` converts a world point into the box's unrotated local frame — used to anchor a hit effect to the body it struck.

### TankPredictor

[src/client/TankPredictor.js](../../src/client/TankPredictor.js) — client-side prediction of the own tank:

- a local replica of the server movement model (`Tank.updateData` without Rapier collisions) at a fixed `timeStep`; the replica's parameters arrive in the port-0 config (`prediction`: timeStep/playerKeys/models/weapons);
- input is written to a local history (`{time, keysMask, oneShotMask}`) and sent to the server as `"seq:action:name"`;
- **reconciliation**: from the frame's player block (`gameId`, `lastInputSeq`, the exact state) state := server → replay the input history from the frame's `serverTime` up to the estimate of the server "now"; the discrepancy goes into `visualError` and fades exponentially (a snap on a large discrepancy);
- rendering: the predicted state overrides interpolation through the same `parse` pipeline, the camera follows the predicted position;
- resets: `camera[2]` (respawn/teleport), a keySet change, a map change; on `condition 0` (death) prediction is frozen;
- `reset()` clears the state **completely** (including `hasState`/`state`/`frozen`) — there is nothing to render until the next player block arrives. On `CLEAR` and `MAP_DATA` the own-tank identity is cleared alongside it (`OwnTank.reset()`); otherwise prediction would resurrect the tank on an already-cleared canvas (together with a looping engine sound).

⚠️ The replica's accuracy is fixed by the parity test `tests/server/TankPredictorParity.test.js` (real Rapier against the replica). Integration order (empirical, fixed by the test): impulses → integrating positions by velocity before damping → damping `v *= 1/(1+dt·d)`.

### OwnTank

[src/client/OwnTank.js](../../src/client/OwnTank.js) — the own tank's bookkeeping, extracted from `main.js`:

- holds the identity (`gameId` from the frame's player block, the model name from the auth form) and the discrete snapshot fields the predicted state does not carry (`condition`/`size`/`teamId`);
- `track(frame)` — per crossed frame: resets prediction on `camera[2]`, refreshes the meta, freezes prediction on `condition 0`, drops the meta when the tank leaves the canvas;
- `getRenderData()` — `null` or `{ game, position }` for `renderTick`: the ghost barrier lives here, the result is `null` while there is no predicted state or the identity/meta are cleared;
- `canFire()` — the fire gate of `ShotPredictor.tryFire` (a predicted state and a living tank);
- `reset()` — clears the identity and calls `predictor.reset()`. Created next to the predictors when the port-0 config carries `prediction`. Covered by `tests/client/OwnTank.test.js`.

### ShotPredictor

[src/client/ShotPredictor.js](../../src/client/ShotPredictor.js) — immediate visual spawning of the own tank's projectiles:

- on pressing fire, the tracer (`w1`) and the bomb (`w2`) spawn immediately (together with the sound); physics, damage, and the explosion (`w2e`) are server-side;
- `tryFire` replicates the server gate: the `fireRate` cooldown, ammo from the panel, the active weapon (the local `nextWeapon`/`prevWeapon` cycle + the authoritative `'wa'`), the `Tank.getMuzzlePosition`/`getFireDirection` formulas;
- the tracer's end point is an approximate raycast ([src/lib/raycast.js](../../src/lib/raycast.js)): `rayVsGrid` (DDA over wall tiles) + `rayVsBox` over interpolated tank positions and over `MapDynamics` boxes (the shared, correctly-centered geometry — see above; before this the predictor kept its own copy of dynamics using the snapshot's *origin* point as if it were the box center, which shifted the ray target by roughly the box's half-extent on a large crate);
- **hit anchoring**: when the ray's closest hit is a `MapDynamics` box, `_buildTracer` appends a 9th, purely local element to the tracer array — `[key, localX, localY]` (the point in the box's own frame, via `MapDynamics.toLocal`). It never crosses the wire (server tracers stay 8 fields, protocol version untouched) — `ShotEffectController` reads it only for the shooter's own locally-predicted shot and uses it to keep the impact particles glued to the crate's live transform instead of a stale world point (see the `parts/` section below);
- **the bomb gate**: the next `explosive` shot is allowed only after the previous one is confirmed by the server — this eliminates FIFO desync under high RTT;
- **bomb position**: it spawns at the predicted tank position, with no velocity extrapolation (the client does not know its own latency; `interpolator.offset` is a clock difference, not a network delay). The offset from the server (which plants the bomb ~RTT/2 later, further along the movement) is closed by a one-off authoritative correction: the confirming server row is not dropped but moved under the local key, and `Bomb.update` shifts the sprite and its sample position to the authoritative point. The entity is not recreated, so neither the timer nor the sound is interrupted;
- **suppressing server duplicates** (`filterServerSnapshot`) by the author id in the event data (`tracers[7]`, `bombs[5]`): own tracers — a FIFO pending queue with a 2 s timeout; the own bomb — on confirmation the server row never reaches the client, its id is remembered as an alias of the local one (`L<n>`): the entity lives under the local key from spawn to detonation, and the explosion `null` is renamed to that key too. This way the bomb is never recreated — otherwise its timer and its one-shot planting sound would restart. Aliases are dropped by the detonation `null`, by age (`BOMB_ALIAS_MAX_AGE`) and by a full `reset()`; a keySet change (`resetLocal()`) does **not** touch them, because keySet arrives before the detonation frame. The local key `L<n>` does not collide with the server's base36 keys.

## Rendering

### parts/ — entities

[src/client/parts/](../../src/client/parts/) — classes drawn on PixiJS canvases: `Tank` (a single class for both the own and other tanks), `TankRadar`, `Map`, `MapRadar`, `Bomb`, `Smoke`, `Tracks` (+`TrackMark`), `ParticlePool`. Effects — in `parts/effects/` (`BaseEffect`, `explosion/` — explosion/crater/smoke, `shot/` — tracer/hit), animated on `Ticker.shared`.

The mapping of snapshot keys to classes and their distribution across canvases — `gameSets`/`entitiesOnCanvas` in `client.js`. A part has no fixed contract — when creating a new one, look at the existing ones as a template.

`ShotEffectController`/`ImpactEffect` (bullet hit, `w1`): when the tracer array carries a 9th (anchor) element — see `ShotPredictor` above — the debris spawn point is recomputed from the crate's *current* `MapDynamics` transform right when the tracer animation finishes. That closes the tracer's own 45–80 ms flight time, during which the crate keeps moving: without the recompute the cloud would appear behind the crate, in empty space. After spawning the debris **stays put** — `ImpactEffect` works in world space and does not follow the crate: the shards lie where the bullet met the obstacle. If the crate disappeared (map change) `MapDynamics.getBox` returns `null` and the point is taken straight from the tracer data. A shot with no anchor (a wall, or any other player's shot — the server protocol carries no struck-body id, see [network.md](network.md#known-limitation-unanchored-hit-effects-for-non-local-shots)) behaves exactly as before.

`ExplosionEffectController` (bomb explosion) raises the `ExplosionEffect` flash and the crater with smoke (`FunnelEffect`) together in `run()`: the crater appears at the same instant as the flash and underneath it, fading in over `FUNNEL_FADE_IN_DURATION_MS` — a phase short enough to only take the click off the appearance. Both go onto the scene in a single `addChild`, so the layer order is recomputed by one `sortChildren`. The controller's own destruction hangs on the crater completing, so `run()` on an already-cleared scene destroys the controller itself — otherwise the sound registered in the constructor would never be released. A repeated `run()` is ignored: it would raise a second pair of effects over the first and lose the references to it. The mark's geometry scales with the blast radius: the crater diameter is a fraction of the radius (`FUNNEL_TO_BLAST_RATIO`), and the sizes/spread/velocities of `SmokeEffect` particles are scaled against a reference radius (`REFERENCE_BLAST_RADIUS`, the `w2` bomb). Lifetimes and alpha do not depend on the radius — they define the effect's character, not its size.

### Factory

[src/lib/factory.js](../../src/lib/factory.js) — a registry of entity name → class. `GameCtrl.parse(name, data)` from incoming data creates an instance, calls `update(data)` on an existing one, or removes it (`null`).

### Providers

- **`BakingProvider`** ([providers/BakingProvider.js](../../src/client/providers/BakingProvider.js)) — one-time generation of procedural textures at startup per the `bakedAssets` config; the baking functions — in [providers/bakers/](../../src/client/providers/bakers/) (no fixed interface, follow the existing ones). A baker that applies blur returns the shape size (`contentSize`) along with the texture, and consumers derive their scale from it: the blur allowance must not affect the visible sprite size.
- **`DependencyProvider`** — injection of services (`renderer`, `soundManager`, `mapDynamics`) into components per the `componentDependencies` map; `mapDynamics` is only present in the service pool when the port-0 config carries `prediction` (spectator-only clients never construct it).

## SoundManager

[src/client/SoundManager.js](../../src/client/SoundManager.js) (on Howler.js). Sounds are described in `src/config/sounds.js`.

- **UI/system** (no position): `playSystemSound(name)` — immediately, bypassing priorities (also used for port-6 sounds).
- **Spatial** (a world position): `registerSound(name, { position })` → `processAudibility()` → `updateActiveSounds()` — the manager itself decides what is audible, respecting the voice limit (`WORLD_VOICE_LIMIT = 30`) and priorities from the config.
- `unregisterSound(id)` drops the registration and stops the sound together with its owner; `releaseSound(id)` drops the registration but lets an already playing one-shot sample finish (a loop is still stopped). The latter is for entities that disappear before their sound does: `parts/Bomb.destroy()` — the bomb lives 300 ms, the planting sample lasts longer.
- `reset()` (map change, round start) drops **all** registrations, while the `parts` that survive it keep their `_soundId`. Owners re-register lazily: `updateSoundData(id, data)` returns `false` when the registration is gone, and `Tank.update` reacts by clearing `_soundId` and calling `_initSounds()` again — otherwise a surviving tank would stay silent forever (the engine sound is the only looping one).

## InputListener

[src/client/InputListener.js](../../src/client/InputListener.js) — low-level keydown/keyup capture for Controls; `modes`/`cmds` take priority over the game key set.

## UI hierarchy (z-index)

`vimp` (1) → `radar` (2) → `chat` (3) → `panel` (4) → `vote` (5) → `game-informer` (6) → `stat` (7) → `auth` (8) → `tech-informer` (9).
