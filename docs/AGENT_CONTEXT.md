# Agent context — ski_game

Read this when implementing features or refactors so changes stay aligned with the jam and architecture.

## Stack

- **Vite** dev server and production build
- **TypeScript** (strict)
- **Three.js** for rendering
- **npm** for packages

## Repository layout


| Path           | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| `src/main.ts`  | Entry: mounts the game into `#app`                               |
| `src/game/`    | Bootstrap, game loop, high-level state (menu / play / game over) |
| `src/scene/`   | Scene graph setup, lights, environment                           |
| `src/objects/` | Meshes, groups, player, world props                              |
| `src/systems/` | Input, movement, spawning, scoring, networking hooks             |
| `src/assets/`  | Loaders, manifests, asset path helpers                           |
| `src/lib/`     | Small shared utilities (math, RNG, easing)                       |
| `public/`      | Static files served as-is (keep tiny for jam “instant play”)     |
| `docs/`        | Human/agent reference (jam rules, hosting notes)                 |


## Environment variables

- Copy `.env.example` → `.env` locally. **Never commit `.env`.**
- Vite exposes only variables prefixed with `VITE`_ to client code.
- **Secrets:** anything in the client bundle is public. Real secrets belong on a **server** (see `HOSTING_AND_MULTIPLAYER.md`).

## Jam reminders

- No heavy downloads or mandatory loading screens; prefer procedural/low-weight assets early.
- Free web play, no auth wall for the jam submission.
- Full rule text: `docs/VIBEJAM_2026.md`.

## Hosting & multiplayer

- Notes for Vercel vs WebSockets and future backend: `docs/HOSTING_AND_MULTIPLAYER.md`.