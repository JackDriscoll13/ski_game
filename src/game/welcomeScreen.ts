import {
  MOUNTAIN_SERVERS,
  PRIMARY_MOUNTAIN,
  RANGE_BASE_Y,
  type MountainServerDef,
  type SelectedMountain,
} from "./mountains";

const SVG_NS = "http://www.w3.org/2000/svg";
const VB_W = 400;
const VB_H = 200;

export type WelcomeScreenApi = {
  root: HTMLElement;
  destroy: () => void;
};

export type StartPayload = { mountains: SelectedMountain[] };

function svgEl<K extends keyof SVGElementTagNameMap>(
  name: K,
  attrs: Record<string, string> = {},
): SVGElement {
  const el = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
  return el;
}

function pctToX(p: number): number {
  return (p / 100) * VB_W;
}

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

  const countLabelById = new Map<string, SVGTextElement>();

  function playerLine(id: string): string {
    const n = liveCounts.get(id) ?? 0;
    return `${n} skier${n === 1 ? "" : "s"} online`;
  }

  function updateMeta(): void {
    metaEl.textContent = `${PRIMARY_MOUNTAIN.name} · ${playerLine(PRIMARY_MOUNTAIN.id)}`;
  }

  const svg = svgEl("svg", {
    class: "welcome__range-svg",
    viewBox: `0 0 ${VB_W} ${VB_H}`,
    preserveAspectRatio: "xMidYMid meet",
    role: "img",
    "aria-label": `Mountain range with ${PRIMARY_MOUNTAIN.name}`,
  }) as SVGSVGElement;

  const defs = svgEl("defs") as SVGDefsElement;
  defs.innerHTML = `
    <linearGradient id="range-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e3a6e"/>
      <stop offset="55%" stop-color="#122042"/>
      <stop offset="100%" stop-color="#0b1020"/>
    </linearGradient>
    <linearGradient id="range-far" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2d4a7c"/>
      <stop offset="100%" stop-color="#162238"/>
    </linearGradient>
    <linearGradient id="range-near" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a5685"/>
      <stop offset="100%" stop-color="#1a2438"/>
    </linearGradient>
    <filter id="range-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2" result="b"/>
      <feMerge>
        <feMergeNode in="b"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  `;
  svg.appendChild(defs);

  svg.appendChild(
    svgEl("rect", {
      width: String(VB_W),
      height: String(VB_H),
      rx: "14",
      fill: "url(#range-sky)",
    }),
  );

  svg.appendChild(
    svgEl("path", {
      d: "M0 148 L55 118 L95 132 L145 108 L195 122 L255 100 L310 115 L400 98 L400 200 L0 200 Z",
      fill: "url(#range-far)",
      opacity: "0.55",
    }),
  );

  svg.appendChild(
    svgEl("path", {
      d: "M0 168 L70 145 L120 158 L200 138 L280 152 L340 142 L400 155 L400 200 L0 200 Z",
      fill: "#0f1628",
      opacity: "0.45",
    }),
  );

  function mountPeak(m: MountainServerDef): void {
    const cx = pctToX(m.mapXPercent);
    const baseY = RANGE_BASE_Y;
    const pts = `${cx - m.halfWidth},${baseY} ${cx},${m.peakY} ${cx + m.halfWidth},${baseY}`;

    const g = svgEl("g", {
      class: "mountain-node mountain-node--solo",
      "data-id": m.id,
    }) as SVGGElement;

    const poly = svgEl("polygon", {
      points: pts,
      fill: "url(#range-near)",
      stroke: "rgba(126,231,135,0.45)",
      "stroke-width": "2",
      filter: "url(#range-glow)",
    }) as SVGPolygonElement;

    const name = svgEl("text", {
      x: String(cx),
      y: String(m.peakY - 12),
      "text-anchor": "middle",
      fill: "#e8ecf4",
      "font-size": "12",
      "font-family": "system-ui, sans-serif",
      "font-weight": "600",
    }) as SVGTextElement;
    name.textContent = m.name;

    const count = svgEl("text", {
      x: String(cx),
      y: String(m.peakY + 8),
      "text-anchor": "middle",
      fill: "#8fa3c4",
      "font-size": "10",
      "font-family": "system-ui, sans-serif",
    }) as SVGTextElement;
    count.textContent = playerLine(m.id);

    g.appendChild(poly);
    g.appendChild(name);
    g.appendChild(count);

    countLabelById.set(m.id, count);
    svg.appendChild(g);
  }

  for (const m of MOUNTAIN_SERVERS) {
    mountPeak(m);
  }

  mapHost.appendChild(svg);

  function refreshCounts(): void {
    for (const [id, el] of countLabelById) {
      el.textContent = playerLine(id);
    }
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
      root.remove();
    },
  };
}
