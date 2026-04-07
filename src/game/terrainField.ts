/** Procedural mountain-range heightfield and palette. The terrain is generated
 *  entirely on CPU so the result can be uploaded to either a WebGL texture or
 *  painted via Canvas 2D. */

import { RANGE_BASE_Y, type MountainServerDef } from "./mountains";

/* ── Layout ────────────────────────────────────────────────────────── */
export const SOURCE_VIEWBOX_H = 200;
export const MAP_W = 560;
export const MAP_H = 308;
export const FW = 320;
export const FH = 176;

/* ── Types ─────────────────────────────────────────────────────────── */
export type HField = { w: number; h: number; data: Float32Array };
export type RGB = [number, number, number];

/* ── Utility ───────────────────────────────────────────────────────── */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
export function smoothstep(e0: number, e1: number, x: number): number {
  if (e0 === e1) return x < e0 ? 0 : 1;
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
export function hexRgb(hex: string): RGB {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

/* ── Seeded RNG ────────────────────────────────────────────────────── */
function createRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

/* ── Noise ─────────────────────────────────────────────────────────── */
function hash(x: number, y: number, s: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return v - Math.floor(v);
}
function valNoise(x: number, y: number, s: number): number {
  const x0 = Math.floor(x),
    y0 = Math.floor(y);
  const tx = x - x0,
    ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx),
    sy = ty * ty * (3 - 2 * ty);
  return (
    lerp(
      lerp(hash(x0, y0, s), hash(x0 + 1, y0, s), sx),
      lerp(hash(x0, y0 + 1, s), hash(x0 + 1, y0 + 1, s), sx),
      sy,
    ) *
      2 -
    1
  );
}
function fbm(x: number, y: number, s: number, oct: number): number {
  let t = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    t += valNoise(x * f, y * f, s + i * 17) * a;
    n += a; a *= 0.5; f *= 2;
  }
  return n > 0 ? t / n : 0;
}
function ridgedFbm(x: number, y: number, s: number, oct: number): number {
  let t = 0, a = 0.55, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const r = 1 - Math.abs(valNoise(x * f, y * f, s + i * 29));
    t += r * r * a; n += a; a *= 0.52; f *= 2.05;
  }
  return n > 0 ? t / n : 0;
}
function warpedFbm(x: number, y: number, s: number, oct: number): number {
  const wx = x + 0.6 * fbm(x + 1.7, y + 9.2, s + 100, 3);
  const wy = y + 0.6 * fbm(x + 8.3, y + 2.8, s + 200, 3);
  return fbm(wx, wy, s, oct);
}
function segInf(
  x: number, y: number,
  ax: number, ay: number, bx: number, by: number,
  w: number,
): number {
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
  const cx = ax + dx * t - x, cy = ay + dy * t - y;
  return Math.exp(-(cx * cx + cy * cy) / w);
}

/* ── Palette: green valleys → gray rock → white snow ───────────────── */
const PAL: { s: number; c: RGB }[] = [
  { s: 0.0, c: hexRgb("#1a2e1c") },
  { s: 0.08, c: hexRgb("#243d26") },
  { s: 0.16, c: hexRgb("#335230") },
  { s: 0.24, c: hexRgb("#45633c") },
  { s: 0.32, c: hexRgb("#5a7048") },
  { s: 0.40, c: hexRgb("#6a7a55") },
  { s: 0.47, c: hexRgb("#7a8268") },
  { s: 0.53, c: hexRgb("#8a8a78") },
  { s: 0.59, c: hexRgb("#989890") },
  { s: 0.65, c: hexRgb("#a8a8a2") },
  { s: 0.71, c: hexRgb("#b8bcc0") },
  { s: 0.78, c: hexRgb("#ccd4dc") },
  { s: 0.85, c: hexRgb("#dfe6ee") },
  { s: 0.93, c: hexRgb("#eef3f7") },
  { s: 1.0, c: hexRgb("#f8fafd") },
];

export function samplePal(h: number): RGB {
  const t = clamp(h, 0, 1);
  for (let i = 1; i < PAL.length; i++) {
    if (t <= PAL[i].s) {
      const p = PAL[i - 1], n = PAL[i];
      return mixRgb(p.c, n.c, smoothstep(p.s, n.s, t));
    }
  }
  return PAL[PAL.length - 1].c;
}

export function buildPaletteData(): Uint8Array {
  const d = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = samplePal(i / 255);
    d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
  }
  return d;
}

/* ── Seed ──────────────────────────────────────────────────────────── */
function buildSeed(mountains: readonly MountainServerDef[]): number {
  let s = 2166136261;
  for (const m of mountains) {
    for (const c of m.id) { s ^= c.charCodeAt(0); s = Math.imul(s, 16777619); }
    s ^= Math.round(m.mapXPercent * 10); s = Math.imul(s, 16777619);
    s ^= Math.round(m.peakY * 10); s = Math.imul(s, 16777619);
  }
  return Math.abs(s);
}

/* ── Range peak generation ─────────────────────────────────────────── */

type RangePeak = {
  x: number; y: number;
  height: number;
  sx: number; sy: number;
  ridges: { angle: number; len: number; w: number }[];
  cutoff: number;
};

type ConnRidge = {
  ax: number; ay: number; bx: number; by: number;
  h: number; w: number;
  minX: number; maxX: number; minY: number; maxY: number;
};

function generateRange(
  seed: number,
  mountains: readonly MountainServerDef[],
): { peaks: RangePeak[]; conns: ConnRidge[] } {
  const rng = createRng(seed);
  const peaks: RangePeak[] = [];

  function makePeak(
    x: number, y: number, height: number,
    sx: number, sy: number, numRidges: number,
  ): RangePeak {
    const ridges: RangePeak["ridges"] = [];
    for (let i = 0; i < numRidges; i++) {
      ridges.push({
        angle: rng() * Math.PI * 2,
        len: (0.06 + rng() * 0.10) * (height + 0.3),
        w: 0.002 + rng() * 0.004,
      });
    }
    const maxRidge = ridges.reduce((m, r) => Math.max(m, r.len), 0);
    return { x, y, height, sx, sy, ridges, cutoff: Math.max(sx * 3, sy * 3, maxRidge + 0.03) };
  }

  // Server mountains — tallest peaks
  for (const m of mountains) {
    peaks.push(makePeak(
      m.mapXPercent / 100,
      m.peakY / SOURCE_VIEWBOX_H,
      0.92 + rng() * 0.08,
      0.10 + rng() * 0.04, 0.09 + rng() * 0.03, 3,
    ));
  }

  // Fill the range with additional peaks
  const target = 13;
  let attempts = 0;
  while (peaks.length < target + mountains.length && attempts < 120) {
    attempts++;
    const px = 0.06 + rng() * 0.88;
    const py = 0.06 + rng() * 0.80;
    let ok = true;
    for (const p of peaks) {
      if (Math.hypot(px - p.x, py - p.y) < 0.09) { ok = false; break; }
    }
    if (!ok) continue;
    peaks.push(makePeak(
      px, py,
      0.30 + rng() * 0.55,
      0.05 + rng() * 0.07, 0.04 + rng() * 0.06, 2,
    ));
  }

  // Connect nearby peaks with ridgelines
  const conns: ConnRidge[] = [];
  const pad = 0.15;
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      const dist = Math.hypot(peaks[i].x - peaks[j].x, peaks[i].y - peaks[j].y);
      if (dist < 0.30) {
        const minH = Math.min(peaks[i].height, peaks[j].height);
        const w = 0.002 + minH * 0.003;
        conns.push({
          ax: peaks[i].x, ay: peaks[i].y,
          bx: peaks[j].x, by: peaks[j].y,
          h: minH * 0.35 * (1 - dist / 0.30),
          w,
          minX: Math.min(peaks[i].x, peaks[j].x) - pad,
          maxX: Math.max(peaks[i].x, peaks[j].x) + pad,
          minY: Math.min(peaks[i].y, peaks[j].y) - pad,
          maxY: Math.max(peaks[i].y, peaks[j].y) + pad,
        });
      }
    }
  }

  return { peaks, conns };
}

/* ── Ridge spur contribution ───────────────────────────────────────── */
function ridgeSpur(
  nx: number, ny: number,
  px: number, py: number,
  angle: number, len: number, w: number,
  height: number,
): number {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const dx = nx - px, dy = ny - py;
  const along = dx * ca + dy * sa;
  const perp = -dx * sa + dy * ca;
  if (along < -0.005) return 0;
  const taper = clamp(1 - along / (len * 1.4), 0, 1);
  return height * 0.35 *
    Math.exp(-(along * along) / (len * len * 0.8)) *
    Math.exp(-(perp * perp) / w) *
    taper;
}

/* ── Height field ──────────────────────────────────────────────────── */
export function buildField(mountains: readonly MountainServerDef[]): HField {
  const f: HField = { w: FW, h: FH, data: new Float32Array(FW * FH) };
  const seed = buildSeed(mountains);
  const { peaks, conns } = generateRange(seed, mountains);
  const southBlend = RANGE_BASE_Y / SOURCE_VIEWBOX_H;

  for (let fy = 0; fy < FH; fy++) {
    const ny = fy / (FH - 1);
    for (let fx = 0; fx < FW; fx++) {
      const nx = fx / (FW - 1);

      // Base rolling terrain
      let h = 0.12;
      h += 0.07 * warpedFbm(nx * 2.2 + 5.1, ny * 2.0 - 3.2, seed + 3, 4);
      h += 0.05 * ridgedFbm(nx * 3.5 + 1.8, ny * 3.2 - 0.5, seed + 7, 3);

      // Slight north-center elevation bias
      h += 0.04 * (1 - 2.2 * Math.abs(ny - 0.38));

      // Peak contributions
      for (let pi = 0; pi < peaks.length; pi++) {
        const pk = peaks[pi];
        const dx = nx - pk.x, dy = ny - pk.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) > pk.cutoff) continue;

        // Broad massif
        const massif = pk.height * Math.exp(
          -(dx * dx / (pk.sx * pk.sx) + dy * dy / (pk.sy * pk.sy)) * 5,
        );
        // Sharp summit
        const summit = pk.height * 0.25 * Math.exp(
          -(dx * dx + dy * dy) / 0.0015,
        );
        // Ridge spurs
        let ridgeH = 0;
        for (const r of pk.ridges) {
          ridgeH += ridgeSpur(nx, ny, pk.x, pk.y, r.angle, r.len, r.w, pk.height);
        }
        // Ridged noise detail near peak
        const prox = Math.exp(-(dx * dx + dy * dy) * 18);
        const detail = prox * 0.10 * ridgedFbm(
          nx * 9 + pi * 1.3, ny * 8.5 - pi * 0.7, seed + 50 + pi * 19, 3,
        );

        h += massif + summit + ridgeH + detail;
      }

      // Connecting ridges between peaks
      for (const c of conns) {
        if (nx < c.minX || nx > c.maxX || ny < c.minY || ny > c.maxY) continue;
        h += c.h * segInf(nx, ny, c.ax, c.ay, c.bx, c.by, c.w);
      }

      // Fine surface texture
      h += 0.025 * fbm(nx * 16, ny * 15, seed + 200, 3);
      h += 0.015 * ridgedFbm(nx * 22, ny * 20, seed + 300, 2);

      // Southern lowland fade
      h -= smoothstep(southBlend - 0.05, 1.0, ny) * 0.25;

      // Edge fade
      const fadeX = 1 - smoothstep(0.70, 1.0, Math.abs(nx - 0.5) / 0.5);
      const fadeY = 1 - smoothstep(0.75, 1.0, Math.abs(ny - 0.42) / 0.58);
      h -= (1 - fadeX * fadeY) * 0.12;

      f.data[fy * FW + fx] = h;
    }
  }

  // Normalize to [0, 1]
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < f.data.length; i++) {
    if (f.data[i] < min) min = f.data[i];
    if (f.data[i] > max) max = f.data[i];
  }
  const range = Math.max(1e-4, max - min);
  for (let i = 0; i < f.data.length; i++) {
    f.data[i] = Math.pow(clamp((f.data[i] - min) / range, 0, 1), 1.02);
  }
  return f;
}
