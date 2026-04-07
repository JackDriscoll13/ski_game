/**
 * Lobby topographic map — renders a procedural terrain heightfield with
 * interactive shading.  Prefers WebGL2 for real-time light updates on
 * pointer move; falls back to Canvas 2D with a CSS light overlay.
 */

import { type MountainServerDef } from "./mountains";
import {
  SOURCE_VIEWBOX_H, MAP_W, MAP_H,
  type HField, type RGB,
  clamp, lerp, smoothstep, mixRgb,
  samplePal, buildField,
} from "./terrainField";
import { createGLRenderer, type GLRenderer } from "./terrainGL";

/* ── Interaction constants ─────────────────────────────────────────── */
const MAX_TILT = 2.4;
const PERSPECTIVE = 800;
const PARALLAX_PX = 5;
const EASE = 0.09;

/* ── Types ─────────────────────────────────────────────────────────── */
type TopographyMapOptions = {
  mountains: readonly MountainServerDef[];
  primaryMountainId: string;
  primaryMountainName: string;
  getPlayerLine: (id: string) => string;
};

export type TopographyMapApi = {
  updateCounts: (getPlayerLine: (id: string) => string) => void;
  destroy: () => void;
};

/* ── Canvas 2D fallback renderer ───────────────────────────────────── */

function sampleF(f: HField, nx: number, ny: number): number {
  const px = clamp(nx, 0, 1) * (f.w - 1);
  const py = clamp(ny, 0, 1) * (f.h - 1);
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(f.w - 1, x0 + 1), y1 = Math.min(f.h - 1, y0 + 1);
  const tx = px - x0, ty = py - y0;
  return lerp(
    lerp(f.data[y0 * f.w + x0], f.data[y0 * f.w + x1], tx),
    lerp(f.data[y1 * f.w + x0], f.data[y1 * f.w + x1], tx), ty,
  );
}

function sampleBuf(buf: Float32Array, w: number, h: number, nx: number, ny: number): number {
  const px = clamp(nx, 0, 1) * (w - 1);
  const py = clamp(ny, 0, 1) * (h - 1);
  const x0 = Math.floor(px), y0 = Math.floor(py);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = px - x0, ty = py - y0;
  return lerp(
    lerp(buf[y0 * w + x0], buf[y0 * w + x1], tx),
    lerp(buf[y1 * w + x0], buf[y1 * w + x1], tx), ty,
  );
}

function buildAO(f: HField): Float32Array {
  const ao = new Float32Array(f.w * f.h);
  const R = 4;
  const dirs: [number, number][] = [
    [-R, 0], [R, 0], [0, -R], [0, R],
    [-R, -R], [R, -R], [-R, R], [R, R],
  ];
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const ch = f.data[y * f.w + x];
      let occ = 0;
      for (const [dx, dy] of dirs) {
        const sx = clamp(x + dx, 0, f.w - 1);
        const sy = clamp(y + dy, 0, f.h - 1);
        occ += clamp(f.data[sy * f.w + sx] - ch, 0, 0.25);
      }
      ao[y * f.w + x] = clamp(1 - occ * 3.0, 0, 1);
    }
  }
  return ao;
}

function buildShadowMap(f: HField): Float32Array {
  const sh = new Float32Array(f.w * f.h);
  const ldx = -0.55, ldy = -0.7, steps = 10;
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) {
      const ch = f.data[y * f.w + x];
      let lit = 1;
      for (let s = 1; s <= steps; s++) {
        const d = s * 1.4;
        const sx = Math.round(x + ldx * d);
        const sy = Math.round(y + ldy * d);
        if (sx < 0 || sx >= f.w || sy < 0 || sy >= f.h) break;
        const diff = f.data[sy * f.w + sx] - ch;
        if (diff > 0.015) lit = Math.min(lit, 1 - smoothstep(0.015, 0.10, diff));
      }
      sh[y * f.w + x] = lit;
    }
  }
  return sh;
}

function drawReliefC2D(
  ctx: CanvasRenderingContext2D, field: HField,
  aoData: Float32Array, shadowData: Float32Array,
): void {
  const img = ctx.createImageData(MAP_W, MAP_H);
  const lx = -0.55, ly = 0.48, lz = 0.52;
  const epsX = 1 / MAP_W, epsY = 1 / MAP_H;

  for (let y = 0; y < MAP_H; y++) {
    const ny = y / (MAP_H - 1);
    for (let x = 0; x < MAP_W; x++) {
      const nx = x / (MAP_W - 1);
      const h = sampleF(field, nx, ny);

      const hl = sampleF(field, nx - epsX, ny);
      const hr = sampleF(field, nx + epsX, ny);
      const hu = sampleF(field, nx, ny - epsY);
      const hd = sampleF(field, nx, ny + epsY);
      const hul = sampleF(field, nx - epsX, ny - epsY);
      const hur = sampleF(field, nx + epsX, ny - epsY);
      const hdl = sampleF(field, nx - epsX, ny + epsY);
      const hdr = sampleF(field, nx + epsX, ny + epsY);

      const dhdx = (hr - hl) * 0.5 + (hur - hul + hdr - hdl) * 0.25;
      const dhdy = (hd - hu) * 0.5 + (hdl - hul + hdr - hur) * 0.25;

      let nrx = -dhdx * 11.0, nry = 1.3, nrz = -dhdy * 13.0;
      const nLen = Math.hypot(nrx, nry, nrz) || 1;
      nrx /= nLen; nry /= nLen; nrz /= nLen;

      const lambert = nrx * lx + nry * ly + nrz * lz;
      const shade = clamp(0.62 + lambert * 0.68, 0.12, 1.45);
      const hHalf = Math.hypot(lx, ly + 1, lz) || 1;
      const spec = Math.pow(clamp((nrx * lx + nry * (ly + 1) + nrz * lz) / hHalf, 0, 1), 28);
      const slope = Math.hypot(hr - hl, hd - hu) * 16;
      const aspect = Math.atan2(-(hd - hu), -(hr - hl));
      const ao = sampleBuf(aoData, field.w, field.h, nx, ny);
      const sh = sampleBuf(shadowData, field.w, field.h, nx, ny);

      const altSnow = smoothstep(0.60, 0.88, h);
      const slopeSnow = clamp(1 - slope * 0.5, 0, 1);
      const aspectSnow = 0.5 + 0.5 * Math.cos(aspect - Math.PI * 0.75);
      const snowMask = altSnow * (0.25 + slopeSnow * 0.45 + aspectSnow * 0.3);

      let color = samplePal(h);
      const baseShade = 0.68 + (shade - 0.5) * 0.92;
      color = [
        Math.round(clamp(color[0] * baseShade, 0, 255)),
        Math.round(clamp(color[1] * baseShade, 0, 255)),
        Math.round(clamp(color[2] * baseShade, 0, 255)),
      ];
      if (snowMask > 0.02) {
        const snowLit: RGB = [245, 247, 252];
        const snowShd: RGB = [184, 199, 219];
        const snowBase = mixRgb(snowShd, snowLit, clamp((shade - 0.35) / 0.5, 0, 1));
        color = mixRgb(color, snowBase, clamp(snowMask * 0.60, 0, 1));
      }
      if (spec > 0.05) {
        const specAmt = spec * smoothstep(0.50, 0.78, h) * 0.28;
        color = mixRgb(color, [255, 255, 255], specAmt);
      }

      // Strong AO
      const aoFact = 0.42 + ao * 0.58;
      color = [Math.round(color[0] * aoFact), Math.round(color[1] * aoFact), Math.round(color[2] * aoFact)];

      // Deep shadows
      if (sh < 0.95) color = mixRgb(color, [9, 13, 23], (1 - sh) * 0.58);

      const wc = clamp(lambert * 0.12 + 0.02, -0.07, 0.07);
      color[0] = clamp(color[0] + wc * 41, 0, 255);
      color[2] = clamp(color[2] - wc * 20, 0, 255);

      const idx = (y * MAP_W + x) * 4;
      img.data[idx] = color[0];
      img.data[idx + 1] = color[1];
      img.data[idx + 2] = color[2];
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

type Pt = { x: number; y: number };

function interpEdge(a: number, b: number, lv: number): number {
  return Math.abs(b - a) < 1e-6 ? 0.5 : clamp((lv - a) / (b - a), 0, 1);
}

function contourSegs(
  tl: number, tr: number, br: number, bl: number,
  lv: number, cx: number, cy: number, sx: number, sy: number,
): [Pt, Pt][] {
  const pts: Pt[] = [];
  const v = [tl, tr, br, bl];
  const cross = (a: number, b: number) => (a < lv && b >= lv) || (a >= lv && b < lv);
  if (cross(v[0], v[1])) pts.push({ x: (cx + interpEdge(v[0], v[1], lv)) * sx, y: cy * sy });
  if (cross(v[1], v[2])) pts.push({ x: (cx + 1) * sx, y: (cy + interpEdge(v[1], v[2], lv)) * sy });
  if (cross(v[2], v[3])) pts.push({ x: (cx + 1 - interpEdge(v[2], v[3], lv)) * sx, y: (cy + 1) * sy });
  if (cross(v[3], v[0])) pts.push({ x: cx * sx, y: (cy + 1 - interpEdge(v[3], v[0], lv)) * sy });
  if (pts.length < 2) return [];
  if (pts.length === 2) return [[pts[0], pts[1]]];
  const avg = (tl + tr + br + bl) * 0.25;
  return avg >= lv
    ? [[pts[0], pts[1]], [pts[2], pts[3]]]
    : [[pts[0], pts[3]], [pts[1], pts[2]]];
}

function drawContoursC2D(ctx: CanvasRenderingContext2D, f: HField): void {
  const sx = MAP_W / (f.w - 1), sy = MAP_H / (f.h - 1);
  const count = 20, lo = 0.08, hi = 0.95;
  for (let li = 0; li < count; li++) {
    const lv = lo + ((hi - lo) * li) / (count - 1);
    const major = li % 4 === 0;
    ctx.beginPath();
    for (let y = 0; y < f.h - 1; y++) {
      for (let x = 0; x < f.w - 1; x++) {
        for (const [a, b] of contourSegs(
          f.data[y * f.w + x], f.data[y * f.w + x + 1],
          f.data[(y + 1) * f.w + x + 1], f.data[(y + 1) * f.w + x],
          lv, x, y, sx, sy,
        )) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }
    }
    // Brown on green terrain, dark gray on snow
    if (lv > 0.55) {
      ctx.strokeStyle = major ? "rgba(46,56,82,.30)" : "rgba(46,56,82,.15)";
    } else {
      ctx.strokeStyle = major ? "rgba(102,82,56,.24)" : "rgba(102,82,56,.12)";
    }
    ctx.lineWidth = major ? 1.2 : 0.55;
    ctx.stroke();
  }
}

function drawFrameC2D(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, MAP_H);
  g.addColorStop(0, "rgba(76,190,240,.07)");
  g.addColorStop(0.35, "rgba(76,190,240,0)");
  g.addColorStop(1, "rgba(8,12,22,.15)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const v = ctx.createRadialGradient(MAP_W * .5, MAP_H * .38, 40, MAP_W * .5, MAP_H * .5, MAP_W * .62);
  v.addColorStop(0, "rgba(255,255,255,0)");
  v.addColorStop(1, "rgba(5,8,15,.20)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, MAP_W, MAP_H);
}

function renderCanvas2D(canvas: HTMLCanvasElement, field: HField): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ao = buildAO(field);
  const shadow = buildShadowMap(field);
  drawReliefC2D(ctx, field, ao, shadow);
  drawContoursC2D(ctx, field);
  drawFrameC2D(ctx);
}

/* ── Marker ────────────────────────────────────────────────────────── */

function createMarker(
  mountain: MountainServerDef, countText: string, primaryId: string,
): { root: HTMLElement; countEl: HTMLElement } {
  const marker = document.createElement("div");
  marker.className = "welcome__topo-marker";
  if (mountain.id === primaryId) marker.classList.add("welcome__topo-marker--primary");

  // `mapXPercent` and `peakY` are the shared logical map coordinates for
  // placing markers; future mountains reuse this same coordinate space.
  marker.style.left = `${mountain.mapXPercent}%`;
  marker.style.top = `${(mountain.peakY / SOURCE_VIEWBOX_H) * 100}%`;

  const pin = document.createElement("span");
  pin.className = "welcome__topo-pin";
  pin.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "welcome__topo-label";

  const nameEl = document.createElement("span");
  nameEl.className = "welcome__topo-name";
  nameEl.textContent = mountain.name;

  const countEl = document.createElement("span");
  countEl.className = "welcome__topo-count";
  countEl.textContent = countText;

  label.append(nameEl, countEl);
  marker.append(pin, label);
  return { root: marker, countEl };
}

/* ── Interaction ───────────────────────────────────────────────────── */

function setupInteraction(
  root: HTMLElement,
  overlay: HTMLElement,
  glRenderer: GLRenderer | null,
): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) return () => {};

  // CSS light overlay only when WebGL isn't handling it
  let lightEl: HTMLElement | null = null;
  if (!glRenderer) {
    lightEl = document.createElement("div");
    lightEl.className = "welcome__topo-light";
    lightEl.setAttribute("aria-hidden", "true");
    root.appendChild(lightEl);
  }

  let tx = 0, ty = 0, cx = 0, cy = 0;
  let raf = 0;
  let hovering = false;

  function tick() {
    cx = lerp(cx, tx, EASE);
    cy = lerp(cy, ty, EASE);
    if (Math.abs(cx - tx) < 0.005 && Math.abs(cy - ty) < 0.005) { cx = tx; cy = ty; }

    root.style.transform =
      `perspective(${PERSPECTIVE}px) rotateX(${-cy * MAX_TILT}deg) rotateY(${cx * MAX_TILT}deg)`;
    overlay.style.transform =
      `translate(${-cx * PARALLAX_PX}px, ${-cy * PARALLAX_PX}px)`;

    if (glRenderer) glRenderer.updateLight(cx, cy);

    if (cx !== tx || cy !== ty || hovering) {
      raf = requestAnimationFrame(tick);
    } else {
      raf = 0;
    }
  }

  function onMove(e: PointerEvent) {
    const r = root.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    ty = ((e.clientY - r.top) / r.height) * 2 - 1;

    if (lightEl) {
      lightEl.style.background =
        `radial-gradient(ellipse at ${(tx + 1) * 50}% ${(ty + 1) * 50}%, rgba(180,220,255,.10), transparent 55%)`;
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function onEnter() { hovering = true; if (!raf) raf = requestAnimationFrame(tick); }
  function onLeave() {
    hovering = false; tx = 0; ty = 0;
    if (lightEl) lightEl.style.background = "";
    if (!raf) raf = requestAnimationFrame(tick);
  }

  root.addEventListener("pointerenter", onEnter);
  root.addEventListener("pointermove", onMove);
  root.addEventListener("pointerleave", onLeave);

  return () => {
    root.removeEventListener("pointerenter", onEnter);
    root.removeEventListener("pointermove", onMove);
    root.removeEventListener("pointerleave", onLeave);
    if (raf) cancelAnimationFrame(raf);
  };
}

/* ── Public API ────────────────────────────────────────────────────── */

export function createTopographyMap(
  host: HTMLElement,
  options: TopographyMapOptions,
): TopographyMapApi {
  const root = document.createElement("div");
  root.className = "welcome__topo";
  root.setAttribute("role", "img");
  root.setAttribute(
    "aria-label",
    `Topographic range map centered on ${options.primaryMountainName}`,
  );

  const canvas = document.createElement("canvas");
  canvas.className = "welcome__topo-canvas";
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  canvas.setAttribute("aria-hidden", "true");

  const overlay = document.createElement("div");
  overlay.className = "welcome__topo-overlay";
  overlay.setAttribute("aria-hidden", "true");

  const compass = document.createElement("div");
  compass.className = "welcome__topo-compass";
  compass.textContent = "N";
  overlay.appendChild(compass);

  const countEls = new Map<string, HTMLElement>();
  for (const mountain of options.mountains) {
    const m = createMarker(mountain, options.getPlayerLine(mountain.id), options.primaryMountainId);
    countEls.set(mountain.id, m.countEl);
    overlay.appendChild(m.root);
  }

  // Build heightfield on CPU, then try GPU shading with Canvas 2D fallback
  const field = buildField(options.mountains);
  let glRenderer: GLRenderer | null = null;
  try {
    glRenderer = createGLRenderer(canvas, field);
  } catch {
    /* WebGL unavailable — fall through */
  }
  if (!glRenderer) renderCanvas2D(canvas, field);

  root.append(canvas, overlay);
  host.replaceChildren(root);

  const teardownInteraction = setupInteraction(root, overlay, glRenderer);

  return {
    updateCounts(getPlayerLine) {
      for (const [id, el] of countEls) el.textContent = getPlayerLine(id);
    },
    destroy() {
      teardownInteraction();
      glRenderer?.destroy();
      countEls.clear();
      root.remove();
    },
  };
}
