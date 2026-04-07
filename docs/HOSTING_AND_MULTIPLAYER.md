# Hosting and multiplayer notes

## Static front end (current repo)

This package is a **static SPA** after `npm run build` (`dist/`). Good fits:

- **Vercel** — connect the GitHub repo; framework preset “Vite”; build `npm run build`, output `dist`.
- Alternatives: **Netlify**, **Cloudflare Pages**, **GitHub Pages** (may need `base` in `vite.config` if not at domain root).

Set any public client config via `**VITE_*`** env vars in the host’s dashboard (not for true secrets).

## Multiplayer / WebSockets

Browser games often need a **long-lived WebSocket server**. **Vercel serverless functions are not a natural fit** for persistent WS connections; typical patterns:

1. **Separate WS host:** Fly.io, Railway, Render, a small VPS, or a managed realtime service (e.g. PartyKit, Ably, Liveblocks, Socket.io on Node elsewhere).
2. **Matchmaking / REST on Vercel** + **game traffic on WS elsewhere** — front end uses `VITE_WS_URL` (see `.env.example`).
3. **Peer-to-peer** (WebRTC) — more complex; still may need a small signaling server.

**Secrets** (API keys, DB URLs) stay on the server; the client only gets **public** endpoints or short-lived tokens if you add a backend later.

## Keeping the jam happy

- Keep the **first interactive frame** fast; defer optional multiplayer connection until after play starts if needed.
- Avoid large asset packs on first paint; document any second-phase load clearly if unavoidable.