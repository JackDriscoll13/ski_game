# Ski Game

Vite + TypeScript + Three.js — [Vibe Coding Game Jam 2026](docs/VIBEJAM_2026.md) entry (in progress).

## Setup

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

Open **http://localhost:5173** — you’ll see the **range map** with one mountain server (live-style player count for now). **Ski** starts the 3D scene (WebGL only after you join, keeping first paint light).

## Daily workflow

| Step | Command | When |
| ---- | ------- | ---- |
| Develop | `npm run dev` | Day-to-day; hot reload |
| Typecheck + bundle | `npm run build` | Before sharing or deploying |
| Smoke-test prod build | `npm run preview` | After `build`, same as prod assets locally |

**Order of work:** nail **gameplay and local dev** first (loop, feel, content). Add **deployment and multiplayer/infra** in a later milestone once the vertical slice is fun—see [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md).

## Scripts


| Command           | Description                             |
| ----------------- | --------------------------------------- |
| `npm run dev`     | Dev server (default port 5173)          |
| `npm run build`   | Typecheck + production build to `dist/` |
| `npm run preview` | Preview production build locally        |


## Docs

- **Jam rules:** [docs/VIBEJAM_2026.md](docs/VIBEJAM_2026.md)
- **Repo / agent context:** [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md)
- **Hosting & multiplayer:** [docs/HOSTING_AND_MULTIPLAYER.md](docs/HOSTING_AND_MULTIPLAYER.md)

