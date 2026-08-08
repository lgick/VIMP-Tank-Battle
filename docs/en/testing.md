# Tests: patterns and coverage

The stack, the two Vitest projects and the run commands are described in [getting-started.md](getting-started.md#tests). This page is about **how** tests are written in this project: the mandatory rule, the coverage map and the patterns that must be followed when adding tests.

## Mandatory rule

After adding or changing code, check that the tests are still valid and update them: cover the new code, fix or delete the stale ones. Every change ends with a green

```bash
npx eslint .
npm test
npx vite build
```

The build is part of the checklist: it catches broken imports and unavailable exports — vite-node under Vitest does not link them strictly, and ESLint does not check cross-module exports.

## Coverage map

Covered (~815 tests):

- the whole of `lib/` (including `security`, the round-trip of `snapshotCodec` and `raycast`);
- client: `SnapshotInterpolator`, `TankPredictor`, `ShotPredictor`, `OwnTank`, the models (Chat, Vote, Controls, Stat, Panel, Auth, Game, CanvasManager), `InputListener`, `SoundManager`, all 8 controllers and views (DOM through happy-dom);
- the **parity test** `tests/server/TankPredictorParity.test.js` — the movement replica against real Rapier; mandatory to run on any change to `Tank.updateData`/`models.js`;
- server modules with logic: Stat, Vote, RTTManager, SnapshotManager, Panel, Chat, TimerManager, Pathfinder, SpatialManager, NavigationSystem, HitscanService, BaseModel, Bomb, Map, Tank, BotManager, BotController, SocketManager, Game, VIMP;
- the participant registry (`ParticipantManager`) and the `core/` managers (`VoteCoordinator`, `RoundManager`, `CommandProcessor`);
- the **integration layer** (`tests/server/integration/`): the full VIMP lifecycle with real modules + the protocol layer `socket/index.js`.

Not covered (low ROI for unit tests): the Pixi `parts/` and `parts/effects/`, the providers (`BakingProvider`/`DependencyProvider`). The exception is applying data inside a part (not the drawing): `Bomb.update` is covered by `tests/client/parts/Bomb.test.js` with a `pixi.js` mock.

## Patterns

**Singletons** (Game, Vote, Stat, Map, Panel, TimerManager, HitscanService, SnapshotManager, the client `*Model`s, InputListener) are isolated with `vi.resetModules()` in `beforeEach` + a dynamic `await import(...)`.

**Rapier works under Vitest**: the WASM is initialized by a top-level await in `src/server/physics/rapier.js`, so real `World`/`RigidBodyDesc`/`ColliderDesc` are available in node tests as well, and `vi.resetModules()` re-initializes the WASM without a noticeable slowdown. But a synchronous infinite loop in the code under test hangs the whole run — when it hangs, look for an infinite loop in the code, not in the Vitest config.

**Physical parts** (Tank, Bomb, Map, Game) are tested with `world`/`body`/`panel` mocks (Rapier names: `createRigidBody`/`createCollider`/`translation`/`linvel`/`applyImpulse`/`castRay`/`collidersWithAabbIntersectingAabb`); real physics is not simulated. The descriptors are real (`RAPIER.RigidBodyDesc`/`ColliderDesc` from `physics/rapier.js`), the geometry is checked against their fields (`desc.translation`, `collider.shape.halfExtents`).

**Heavy singletons with a bulky constructor** (VIMP) are tested in two ways: isolated methods — through the prototype, `Class.prototype.method.call(fakeThis, ...)` (unit); the orchestration — through integration tests.

**Integration tests** (`tests/server/integration/`) build a real VIMP with all the real modules + a `FakeSocketManager` (which records the wire frames) through the shared `harness.js`. Binary snapshot frames (`sendShot`) are decoded by the real `unpackFrame`: `lastShot` returns `[snapshot, camera, serverTime, seq]` — this gives end-to-end coverage of the binary path. Critical points:

- `vi.useFakeTimers()` **before** the VIMP constructor (it starts the timers and the game loop);
- drive the game loop with direct `vimp._onShotTick(dt)` calls, not with `advanceTimers`;
- wait for `process.nextTick` callbacks (createUser, security.origin) with `await nextTick()`;
- the protocol layer (`socket/index.js`) is tested through `vi.doMock('ws', ...)` + a fake `ws`/`req` (the origin `https://localhost:3000` passes the dev allowlist);
- physics determinism: assert the fact/direction, and run the critical outcomes (a kill) through the real `Game.applyDamage`.

**Mock method names** with two consecutive capitals (e.g. coming from an external API) are declared with a computed/string key — otherwise the ESLint rule `no-consecutive-caps` fires.

## Behaviours locked in by tests

Not blockers, but worth knowing when reworking the code:

- `CanvasManager.resize` returns `height` as a string when `fixSize` is on;
- `waiting.getNext` returns `undefined` (not `null`) on an empty queue;
- `sanitizeMessage` is not an XSS defence (escaping happens on output: `textContent` for the text, `setAttribute` for the name); it only strips control characters and returns `''` for non-strings;
- `validateAuth` is inconsistent: an early `return` for missing/non-string values vs accumulating the validator errors.
