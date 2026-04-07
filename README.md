# Ski Game

Vite + TypeScript + Three.js — [Vibe Coding Game Jam 2026](docs/VIBEJAM_2026.md) entry (in progress).

## Setup

```bash
npm install
cp .env.example .env   # optional
npm run dev
```

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Dev server (default port 5173) |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run preview` | Preview production build locally |

## Docs

- **Jam rules:** [docs/VIBEJAM_2026.md](docs/VIBEJAM_2026.md)
- **Repo / agent context:** [docs/AGENT_CONTEXT.md](docs/AGENT_CONTEXT.md)
- **Hosting & multiplayer:** [docs/HOSTING_AND_MULTIPLAYER.md](docs/HOSTING_AND_MULTIPLAYER.md)

## GitHub

After creating a repo on GitHub:

```bash
git init
git add .
git commit -m "chore: scaffold Vite + Three.js game"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

With [GitHub CLI](https://cli.github.com/):

```bash
gh repo create <repo-name> --public --source=. --remote=origin --push
```
