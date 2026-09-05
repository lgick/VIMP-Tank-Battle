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

### PredictedSet

[src/client/PredictedSet.js](../../src/client/PredictedSet.js) — the shared mechanics of a predicted-world subsystem and the base class of `MapDynamics` and `RemoteTanks`. Every body lives in one of two modes: `follow` (interpolation drives the transform) or `predicted` (the `TankPredictor` simulation owns the body).

The base holds: reconciliation (`beginReconcile`/`finishReconcile`), the step (`integratePredicted`), the smoothing-error decay (`decayError`), promotion and release (`_promote`, `demoteIdle`, `releasePredicted`), the predicted-set cap and the whole contract `TankPredictor._resolveWorld` relies on. A subclass defines only what is genuinely its own: reading bodies from game data (`update`), reading them from a raw frame (`_eachSnapshotBody`), the capture rule (`capture`) and the render block format (`getRenderData`).

Why a base class rather than two copies: the subsystems must behave identically — any divergence in the release or smoothing rules shows up as a crate and another player's tank behaving differently in the very same contact.

### MapDynamics

[src/client/MapDynamics.js](../../src/client/MapDynamics.js) — the single source of map-dynamics geometry on the client **and its predictor**: the tracer raycast in `ShotPredictor` and the hit-effect anchoring in `ShotEffectController` must see the exact same boxes, otherwise the impact point and the debris cloud diverge from each other.

**Why a predictor.** The own tank is drawn at "now" (`TankPredictor`), everything else at the interpolation delay (`interpolation.delay: 100` ms). While a crate sits still there is no difference; the moment it gets pushed, the server moves it ahead of the drawn one over those 100 ms, and the authoritative tank position legitimately ends up **inside the drawn** crate. The fix is not masking on the tank's side but computing the bodies tied to the tank in the **same** simulation and the same time frame — then there is nothing for them to squeeze each other out of.

**Body modes.**

- `follow` — the transform comes from interpolation (`update(game)`), as before; most bodies live here;
- `predicted` — the simulation owns the body: `integratePredicted(dt)` (integration from [src/lib/rigidBody.js](../../src/lib/rigidBody.js)) plus contacts resolved by `TankPredictor._resolveWorld`.

**Capture and release.** `capture(tankObb, localNow)` promotes to `predicted` every body intersecting the tank's OBB inflated by `CAPTURE_MARGIN`, and **transitively** their contact neighbours (a stack of crates moves as one); the set is capped by `MAX_PREDICTED_BODIES` — otherwise `canopy`'s 20-crate wall would be pulled in whole. `demoteIdle(localNow)` returns a body to `follow` only once `PREDICTION_HOLD_MS` has passed since the last contact **and** the prediction has converged with interpolation within `DEMOTE_POSITION_EPSILON`/`DEMOTE_ANGLE_EPSILON` — that convergence is what guarantees the release causes no visible jump.

⚠️ Capturing an **already moving** body swaps its interpolated transform for the authoritative one, which is ahead by `interpolation.delay`: without compensation the sprite would jump by `delay×v` (4 units for a crate at 40 u/s). So `_promote` puts the difference "where it was drawn − new state" into `error`, which then fades through the usual `decayError`; a divergence above `ERROR_SNAP_DISTANCE` is snapped instead.

**Release (`releasePredicted()`).** An unconditional return of every body to `follow`. It is needed because `demoteIdle` only runs from a simulation step: once `TankPredictor` stops stepping (spectator, own tank destroyed, waiting for the first authoritative frame) nothing would ever release the body, while `getRenderData()` keeps overriding interpolation every frame — the crate would stay frozen on screen until the next `MAP_DATA`. `TankPredictor.update()` calls it on its own early return; convergence is not checked here, as there is nobody left to converge with.

⚠️ The scope is deliberately narrow: a crate pushed by **another** player's tank stays on interpolation. Drawing every body at "now" would put such a crate 100 ms ahead of that tank's sprite — to an observer it would look like a push from a distance. This is a considered choice, not an omission.

**One clock.** The class has no accumulator of its own: its `TankPredictor` steps it (`integratePredicted`, `decayError`). That way a tank↔crate contact is resolved within one and the same step, and reconciliation's replay automatically replays the crates too.

**Reconciliation.** `beginReconcile(snapshot)` takes the authoritative frame before the replay (records `lastServer`, sets `hasServer = true`, and swaps predicted bodies' state for the server one), `finishReconcile()` after it: the discrepancy between the old prediction and the new state goes into `error` and fades through `decayError(elapsed)` exactly like the tank's `visualError`; beyond `ERROR_SNAP_DISTANCE` the error is snapped instead. The call order in `main.js` is critical — `finishReconcile` must come **after** `predictor.onServerState`. Before the first authoritative frame arrives (`hasServer` still `false`) a body promoted straight into `predicted` seeds from the interpolated `follow` transform instead of `lastServer` — otherwise it would teleport to the map's starting layout.

**Conventions.**

- `setMap({ physicsDynamic, scale, setId })` builds each box's half-extents and mass properties from `MAP_DATA` (`m = density·w·h`, `I = m·(w²+h²)/12`, extents multiplied by the map's `scale`) and records `setId` — the dynamics block key (`c1`/`c2`) that `getRenderData()` emits its result under and that `update(game)` selects its own block by: `dN` keys are positional, so another map constructor's block would drag the current map's bodies into foreign coordinates;
- boxes are stored **centered**, unlike the `c1`/`c2` snapshot where `[x, y, angle]` is the object's *origin* (the Rapier body position — the server collider is offset from it by `(width/2, height/2)` in the object's rotated local frame, see `src/server/parts/Map.js`); `boxCenterFromOrigin` ([src/lib/collision.js](../../src/lib/collision.js)) performs the conversion once, here, instead of every consumer repeating (and risking getting wrong) the same offset math. `getRenderData()` performs the inverse conversion — `parts/Map.js` expects the object origin;
- the velocity from the snapshot (`vx/vy/angvel`, protocol v4 — see [network.md](network.md)) is the velocity of the **centre of mass** and can go into the body unconverted; the position cannot. The claim is pinned by the probe test `tests/server/RapierBodySemantics.test.js`.

**Two views of the geometry — pick the one your consumer needs.**

- **Render view** — `getBox(key)`/`getBoxes()`: state plus the smoothing `error`, i.e. where the box is actually *drawn*. Consumers: `ShotEffectController`'s debris anchoring, `toWorld(key, localX, localY)` (a local point back to a world point in this frame — used to relocate a tracer's end onto the drawn crate, see `ShotPredictor` below).
- **Simulation view** — `getSimBoxes()`/`toLocal(key, worldX, worldY)`: where the server sees the box **right now** — a `predicted` body's own state (the `error` is cosmetic only) or, for a `follow` body, the last authoritative frame (`lastServer`), never the interpolated transform, which lags by `interpolation.delay` and would send a ray at a moving crate wide. Consumer: `ShotPredictor`'s raycast — for the same reason a shot is built from `TankPredictor.getSimState()` rather than the render state, a local hit must match what the server would compute, or splinters would fly with no impulse behind them.

`toLocal` and `toWorld` operate on the material point of the box in their respective frame, which is why a tracer's impact anchor (computed via `toLocal` against the sim box) can be converted back to a world point via `toWorld` and land exactly on the drawn crate, even while the two frames disagree.

### RemoteTanks

[src/client/RemoteTanks.js](../../src/client/RemoteTanks.js) — the same fix applied to **other players' tanks in contact with the own one**: pushing another tank drives the pusher's sprite straight into the target's drawn hull (the client never resolved that contact at all), while on the pushed player's screen the two tanks stop with a visible gap (the pusher is drawn where it was 100 ms ago). Same cure as `MapDynamics`: a tank caught in contact is promoted to `predicted`, extrapolated to "now", and takes part in the same two-body contact as everything else.

⚠️ The scope is deliberately narrow — only contacting tanks. Predicting everyone would trade interpolation's silky look for extrapolation's jitter everywhere it isn't needed.

⚠️ Extrapolation runs with **zero damping** (`linearDamping: 0, angularDamping: 0`): the other player's input is unknown, and a tank that's actively driving holds its throttle, so its velocity is roughly constant over the 100 ms window. Applying the model's own damping would brake someone else's tank for no reason (`linear 3` eats ~23% of speed in 100 ms).

**Capture uses lookahead, not "already touching."** On the pushed player's screen the naive test — does the own tank's OBB already overlap the other tank's *drawn* transform? — never fires: the drawn transform is `interpolation.delay` behind and hasn't arrived yet, so the contact "hasn't happened" as far as that screen is concerned, and prediction never engages. `capture()` therefore tests against the **authoritative** position extrapolated forward by its own velocity over `CAPTURE_LOOKAHEAD` (0.2 s) — `_captureObb()`. Capturing a touch early is harmless (the predicted body just tracks the server exactly); missing it is not. No transitive closure here (unlike `MapDynamics`): a chain of tanks pushing tanks pushing tanks is vanishingly rare, and extra predicted bodies mean extra jitter on other screens for no benefit; the set is capped by `MAX_PREDICTED_TANKS`.

The rest of the mechanics is shared, from `PredictedSet` (see above). Differences: bodies are keyed `${modelKey}:${gameId}`; `getRenderData()` returns the snapshot-shaped tank array (11 fields, protocol v5 — see [network.md](network.md)) grouped by model key, ready for the ordinary `applyGameData` pipeline; the own tank is excluded via `setOwnGameId`; `reset()` exists (unlike `MapDynamics`, which has none by design — see above) and is called on both `MAP_DATA` and `CLEAR` in `main.js`.

⚠️ A destroyed tank (`condition 0`) is **not** excluded from prediction: the server drops its body from the world only when the player leaves, switches team or a new round starts (`Game.removePlayer`), and until then the wreck stays a solid, pushable body. The client has to see it the same way — otherwise the own tank would drive through the drawn wreck until the server corrects it.

**Simulation hulls** — `getSimBoxes()` (keyed by `gameId`) and `toRenderPoint(gameId, worldX, worldY)`: exactly the pair `MapDynamics` has, for exactly the same job — the shot raycast in `ShotPredictor`. The ray must travel against the hull as the server sees it *now* (own state for `predicted`, `lastServer` for `follow`), while the tracer's visible endpoint is moved onto the drawn hull, which lags by `interpolation.delay`.

### TankPredictor

[src/client/TankPredictor.js](../../src/client/TankPredictor.js) — client-side prediction of the own tank:

- a local replica of the server movement model (`Tank.updateData` without Rapier collisions) at a fixed `timeStep`; the replica's parameters arrive in the port-0 config (`prediction`: timeStep/playerKeys/models/weapons);
- input is written to a local history (`{time, keysMask, oneShotMask}`) and sent to the server as `"seq:action:name"`;
- **reconciliation**: from the frame's player block (`gameId`, `lastInputSeq`, the exact state) state := server → replay the input history from the frame's `serverTime` up to the estimate of the server "now"; the discrepancy goes into `visualError` and fades exponentially (a snap on a large discrepancy);
- rendering: the predicted state overrides interpolation through the same `parse` pipeline, the camera follows the predicted position;
- resets: `camera[2]` (respawn/teleport), a keySet change, a map change; on `condition 0` (death) prediction is frozen;
- `reset()` clears the state **completely** (including `hasState`/`state`/`frozen`) — there is nothing to render until the next player block arrives. On `CLEAR` and `MAP_DATA` the own-tank identity is cleared alongside it (`OwnTank.reset()`); otherwise prediction would resurrect the tank on an already-cleared canvas (together with a looping engine sound);
- **two read-outs of the state**: `getRenderState()` includes `visualError` — what gets drawn; `getSimState()` is the same state **without** it — what the server would replay on its own. `ShotPredictor.tryFire` is fed `getSimState()`, not the render one: `visualError`'s angle is purely cosmetic smoothing and would rotate the muzzle direction, so a shot built from it could locally hit a crate the server's ray misses (splinters fly, no impulse follows). Both also carry `angvel` (protocol v5).

**Predicted sets.** The constructor takes `{ mapDynamics, remoteTanks }` (either may be omitted) and keeps them as `this._predictedSets` — the map-dynamics crates and the other players' tanks currently in contact with the own one (`RemoteTanks`, see above). Both implement the same small interface (`capture`, `integratePredicted`, `getPredictedBodies`, `noteContacts`, `demoteIdle`, `releasePredicted`, `decayError`) so `_resolveWorld` treats them uniformly.

⚠️ While the predictor steps, bodies are returned to interpolation by `demoteIdle`; once it **stops** stepping (spectator, freeze after the own tank is destroyed, waiting for the first authoritative frame) `update()` calls `releasePredicted()` on every set from its early return — otherwise predicted bodies would stay frozen on screen forever. A freeze additionally makes `_resolveWorld` a complete no-op: a destroyed hull pushes nothing, and capturing would bind bodies to it.

**Collisions (`_resolveWorld`).** At the end of every `_step`, after integration and damping, the tank, every predicted body from `_predictedSets` and the walls are resolved as a single physical scene:

- contacts are collected **once** per step: `collectTileContacts` (the tank and every predicted body against the wall tile grid) and `obbVsObb` (tank↔body and every body↔body pair) — both from [src/lib/collision.js](../../src/lib/collision.js);
- the penetration-depth separation (`separateBodies`) is applied **exactly once per contact**; repeating it on every iteration would push bodies apart by a multiple of the iteration count and produce a jerk in the drawn position;
- impulses (`applyContactImpulse` from [src/lib/rigidBody.js](../../src/lib/rigidBody.js)) sweep the collected contacts `SOLVER_ITERATIONS` times — a standard sequential impulse solver;
- the contact is **two-body**: the tank's mass (`density·w·h` from `models.js`) and a crate's or another tank's mass are comparable, so the "infinitely heavy other body" approximation gives a visibly wrong picture. Surface coefficients are combined by the average rule, as in Rapier (`combineSurfaces`): tank↔crate and tank↔wall — `friction 0.35`/`restitution 0.05`, crate↔crate and crate↔wall — `0.2`/`0`, tank↔tank uses each model's own `fixture.friction`/`fixture.restitution`. The map surface defaults (`MAP_SURFACE`) and the mass-property formula (`boxMassProperties`) live in [src/lib/rigidBody.js](../../src/lib/rigidBody.js) — a module shared with the server, which builds its colliders from the same values: were they to drift apart, the replica would silently diverge from the authoritative physics;
- `setMap({ map, step, scale, physicsStatic })` supplies the wall grid.

⚠️ **Invariant**: without `setMap()` and with an empty `_predictedSets` the collision pass is a complete no-op and the movement replica stays bit-for-bit unchanged. The parity test relies on this.

⚠️ The replica's accuracy is fixed by the parity test `tests/server/TankPredictorParity.test.js` (real Rapier against the replica). Integration order (empirical, fixed by the test): impulses → integrating positions by velocity before damping → damping `v *= 1/(1+dt·d)`. `integrate` in `rigidBody.js` must repeat that same order — otherwise the predicted bodies and the tank drift apart from each other.

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
- the tracer's end point is an approximate raycast ([src/lib/raycast.js](../../src/lib/raycast.js)): `rayVsGrid` (DDA over wall tiles) + `rayVsBox` over `RemoteTanks.getSimBoxes()` and `MapDynamics.getSimBoxes()` — the **simulation** view (the shared, correctly-centered geometry — see above; before this the predictor kept its own copy of dynamics using the snapshot's *origin* point as if it were the box center, which shifted the ray target by roughly the box's half-extent on a large crate). The simulation view matters specifically for a *moving* crate: the render view lags by `interpolation.delay`, so a ray built from it could sail clean past a crate the server sees dead ahead — the same class of bug `getSimState()` closes for the shooter's own angle;
- **other players' tanks go through simulation hulls too**: `RemoteTanks.getSimBoxes()` (without the remote-tank predictor wired in, the old path over the interpolated positions from `updateWorld` remains). The hit point is moved onto the drawn hull via `RemoteTanks.toRenderPoint()` — otherwise on a moving tank the tracer would break off in mid-air, `delay×v` short (up to the hull's own length);
- **hit anchoring**: when the ray's closest hit is a `MapDynamics` box, `_buildTracer` computes the local anchor `[key, localX, localY]` against the **simulation** box (`toLocal`), then converts it back to a world point via `toWorld` — landing on the **render** box — and moves the tracer's visible endpoint there, so a shot resolved against the server's geometry still visually ends on the crate as it's drawn, not floating in empty space beside it. The anchor never crosses the wire (server tracers stay 8 fields, protocol version untouched) — `ShotEffectController` reads it only for the shooter's own locally-predicted shot and uses it to keep the impact particles glued to the crate's live transform instead of a stale world point (see the `parts/` section below);
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

**A source at the listener's own point is not panned.** `_updateSpatialSound` calls `sound.pos()` only beyond `MIN_SPATIAL_DISTANCE`; until that happens Howler never creates a `PannerNode` at all and the sound goes straight into the gain node. This is for the own tank: the listener is placed exactly at its predicted position (`main.js`, `applyCamera(own.position)`), and `applyGameData` puts `parts/Tank` at the very same point — its distance is always 0. For `panningModel: 'HRTF'` a zero direction is degenerate: instead of panning you get a front-facing convolution that shaves off the top end, turning the bass-heavy engine sample into a flat hum; on top of that the first `pos()` makes Howler do a `pause()/play()`, i.e. a click exactly when the tank appears. An instance whose panner already exists (another player's tank that drove up close) is flagged `panned` and is returned to the centre at short range as before.

**The engine sound** (`parts/Tank.js`, `calculateEngineSoundParams`): `engineLoad` drives the pitch (`rate` from `MIN_ENGINE_RATE` at idle to `MAX_ENGINE_RATE` at full speed and up to `STRAIN_ENGINE_RATE` under strain — gas into a wall) and the volume (`MIN_ENGINE_VOLUME_FACTOR` → `MAX_ENGINE_VOLUME_FACTOR` of the config's base). At idle the pitch additionally wobbles slightly (`IDLE_WOBBLE_DEPTH`/`IDLE_WOBBLE_HZ`), the wobble fading out as the load grows: a bass tone held at a fixed pitch reads to the ear as a hum, not as an engine.

## InputListener

[src/client/InputListener.js](../../src/client/InputListener.js) — low-level keydown/keyup capture for Controls; `modes`/`cmds` take priority over the game key set.

## UI hierarchy (z-index)

`vimp` (1) → `radar` (2) → `chat` (3) → `panel` (4) → `vote` (5) → `game-informer` (6) → `stat` (7) → `auth` (8) → `tech-informer` (9).
