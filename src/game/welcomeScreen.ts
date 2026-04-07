import {
  MOUNTAIN_SERVERS,
  PRIMARY_MOUNTAIN,
  type SelectedMountain,
} from "./mountains";
import { createTopographyMap } from "./topographyMap";

export type WelcomeScreenApi = {
  root: HTMLElement;
  destroy: () => void;
};

export type StartPayload = { mountains: SelectedMountain[] };

export function createWelcomeScreen(
  parent: HTMLElement,
  onStart: (payload: StartPayload) => void,
): WelcomeScreenApi {
  const root = document.createElement("div");
  root.className = "welcome";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-labelledby", "welcome-title");

  const liveCounts = new Map<string, number>(
    MOUNTAIN_SERVERS.map((m) => [m.id, m.players]),
  );

  root.innerHTML = `
    <div class="welcome__panel welcome__panel--range">
      <header class="welcome__header">
        <p class="welcome__eyebrow">Range map · your server</p>
        <h1 id="welcome-title" class="welcome__title">Northern Cirque</h1>
        <p class="welcome__subtitle">
          One mountain online for now — same idea as a game server, with a live-style headcount until multiplayer lands.
        </p>
      </header>

      <div class="welcome__range-wrap">
        <div class="welcome__range-map" id="range-map-host"></div>
        <p class="welcome__range-hint">The button is focused first — <kbd>Enter</kbd> or click to ski</p>
      </div>

      <p class="welcome__server-meta" id="welcome-server-meta" aria-live="polite"></p>

      <button type="button" class="welcome__cta" id="welcome-cta">Ski ${PRIMARY_MOUNTAIN.name}</button>
      <p class="welcome__hint">WebGL starts after you join.</p>
    </div>
  `;

  const mapHost = root.querySelector<HTMLElement>("#range-map-host")!;
  const metaEl = root.querySelector<HTMLElement>("#welcome-server-meta")!;
  const cta = root.querySelector<HTMLButtonElement>("#welcome-cta")!;

  function playerLine(id: string): string {
    const n = liveCounts.get(id) ?? 0;
    return `${n} skier${n === 1 ? "" : "s"} online`;
  }

  function updateMeta(): void {
    metaEl.textContent = `${PRIMARY_MOUNTAIN.name} · ${playerLine(PRIMARY_MOUNTAIN.id)}`;
  }

  const topoMap = createTopographyMap(mapHost, {
    mountains: MOUNTAIN_SERVERS,
    primaryMountainId: PRIMARY_MOUNTAIN.id,
    primaryMountainName: PRIMARY_MOUNTAIN.name,
    getPlayerLine: playerLine,
  });

  function refreshCounts(): void {
    topoMap.updateCounts(playerLine);
    updateMeta();
  }

  const ticker = window.setInterval(() => {
    for (const m of MOUNTAIN_SERVERS) {
      let n = liveCounts.get(m.id) ?? 0;
      n += Math.floor(Math.random() * 5) - 2;
      n = Math.max(0, Math.min(999, n));
      liveCounts.set(m.id, n);
    }
    refreshCounts();
  }, 2800);

  updateMeta();

  const commit = (): void => {
    onStart({
      mountains: MOUNTAIN_SERVERS.map((m) => ({ id: m.id, name: m.name })),
    });
  };

  cta.addEventListener("click", commit);

  parent.appendChild(root);
  queueMicrotask(() => {
    cta.focus({ preventScroll: true });
  });

  return {
    root,
    destroy: () => {
      window.clearInterval(ticker);
      cta.removeEventListener("click", commit);
      topoMap.destroy();
      root.remove();
    },
  };
}
