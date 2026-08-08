# CLAUDE.md

## Language rule

**STRICT**: every reply, explanation, code comment and message during work must be in **Russian**. Highest priority, no exceptions. This file itself stays in English.

## Project

Tank Battle — multiplayer 2D real-time tank game. Authoritative Node.js + Express + `ws` + Rapier 2D server, PixiJS client, WebSocket transport with binary snapshot frames.

Docs: [docs/en/README.md](docs/en/README.md) (primary) + [docs/ru/README.md](docs/ru/README.md) (mirror). Read the relevant page before touching a subsystem; details belong there, not here.

## Commands

```bash
npm run dev       # nodemon: src/server, src/lib, src/config, src/data
npm start         # production
npm run build     # audio + Vite bundle
npx eslint .      # lint
npm test          # Vitest (also test:watch, test:coverage)
```

Dev needs local HTTPS certs in `.certs/` and an `.env` (`TANK_BATTLE_*`) — see `docs/*/getting-started.md`.

## Definition of done

1. Green `npx eslint .` + `npm test` + `npx vite build`.
2. Tests updated/added; patterns in `docs/*/testing.md`. Editing `Tank.updateData` or `src/data/models.js` requires `tests/server/TankPredictorParity.test.js`.
3. Docs updated **in both language folders in the same change** — `docs/en/` and `docs/ru/` are always in sync. Which page: ports/frame format/codec → `network.md`; `src/config/*`, env, `src/data/*` → `configuration.md`; server modules → `server.md`; client modules → `client.md`; game rules, votes, chat commands, controls → `gameplay.md`; how content is added → `extending.md`; test patterns → `testing.md`; deploy, workflows, npm scripts → `deployment.md` + `getting-started.md`.

Links inside docs: bare names within a language folder (`server.md`), `../../src/...` for sources. Root `README.md` — English only, a short showcase linking to `docs/`.

## Code conventions

- ES modules only (`"type": "module"`); `===`, `let`/`const`, curly braces everywhere.
- `camelCase` / `PascalCase` (classes) / `UPPER_SNAKE_CASE` (constants); no two consecutive capitals in camelCase (ESLint `no-consecutive-caps`; exceptions `VX`, `VY`, `RTT`).
- Import order: Node built-ins → npm → internal modules → relative paths.
- Tests live in `tests/`, mirroring `src/` — never next to the code.
- Clarity over brevity, no hacks; ask the developer about debatable architecture or pattern choices.
- Comments: short, explain *why*, not *what*.
- New entities follow existing ones — no fixed contracts, existing files are the template.
- `_`-prefixed files/dirs are **experimental**: not committed, ignored by ESLint and by Claude — do not read, edit or comment on them unless told otherwise.
