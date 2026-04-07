# Lobby Map Redesign — Handoff Prompt

> **Status:** Ready for implementation.
> **Goal:** Replace the current procedural noise terrain with a stylized illustrated map that looks like something from a great browser strategy game.

---

## Context & why the current approach failed

We've iterated three times on a procedural Canvas 2D / WebGL terrain renderer for the lobby map. Each attempt used value noise, ridged FBM, and hillshading to simulate a top-down relief map. The results all look the same: a muddy procedural noise blob that doesn't read as a mountain range regardless of how many shading passes, AO taps, or palette tweaks we add.

**The fundamental problem:** value noise terrain will always look like value noise terrain. No amount of post-processing gives it the character of an illustrated map. Browser games with great maps (Grepolis, Travian, Forge of Empires, Tribal Wars) don't use procedural noise at all — they use **hand-painted 2D tile art**, **pre-rendered illustrated assets**, or **stylized flat-color zones with strong outlines**. That's why they look good.

The reference image at `docs/_local/topo-lobby-reference.png` is a James Niehues-style hand-painted ski resort panorama — it's a painting, not a render. We can't match it with math, but we can match its *spirit* with strong art direction.

---

## The new approach: stylized illustrated map

Instead of simulating photorealistic terrain from noise, render the map as a **stylized topographic illustration** — think trail map, not Google Earth. The visual language should be:

- **Flat color bands** for elevation zones (dark valley, forest, alpine, snow) with clean edges
- **Bold contour lines** that feel hand-drawn (slight irregularity, varying thickness)
- **Paper/parchment texture** as a subtle background layer
- **Ridge lines and peak markers** drawn as deliberate graphic elements, not emergent from noise
- **Strong shadows** as simple dark overlays on one side of each ridge, not computed from normals
- **Labels and markers** integrated into the illustration style, not floating on top

Think: a topographic map you'd find framed in a ski lodge, or the world map from a Zelda game, or the strategic overview from Grepolis. **Readable, tactile, stylish.**

### Visual references to study

These are for art direction inspiration — do NOT use their assets:

1. **Grepolis / Tribal Wars world maps** — hand-painted terrain tiles composited on a grid. Mountains are illustrated sprites, not heightfields. Water has stylized waves. The whole thing reads as "someone drew this."
2. **Ski resort trail maps** (James Niehues style) — bold ridge silhouettes, flat snow zones, green treeline bands, red labels. See `docs/_local/topo-lobby-reference.png`.
3. **Zelda: Breath of the Wild map** — watercolor washes, visible paper texture, clean iconography.
4. **USGS topographic maps** — brown contour lines on white, green vegetation tint, blue water. The canonical "map" visual language.

### Rendering technique

Use **Canvas 2D** with a **zone-based** approach, not per-pixel noise shading:

1. **Keep the heightfield** from `terrainField.ts` — it defines the terrain shape (multiple peaks, ridges, valleys). The topology is fine; it's the *rendering* that needs to change.

2. **Quantize the heightfield into elevation zones** (5-7 bands):
   - Valley floor (0.0–0.20): dark earthy green, represents forest/lowland
   - Lower slopes (0.20–0.35): medium green
   - Upper forest (0.35–0.48): lighter green, maybe with tree texture dots
   - Treeline/alpine (0.48–0.60): tan/brown rocky transition
   - High rock (0.60–0.72): gray-brown alpine rock
   - Snow (0.72–0.85): light blue-gray patchy snow
   - Peak snow (0.85–1.0): bright white

3. **Draw each zone as a filled region** with slightly irregular edges (use the contour line at each threshold, maybe with slight noise displacement for a hand-drawn feel). Fill with flat color, not gradient shading.

4. **Draw bold contour lines** at zone boundaries and intermediate elevations. Major contours (zone boundaries) thicker and darker. Minor contours thinner. Use a warm brown color on lower elevations, dark blue-gray on snow. Slightly vary line thickness for a hand-drawn quality.

5. **Add ridge lines** as deliberate graphic strokes — trace the local maxima (ridgelines) of the heightfield and draw them as bold dark lines, like a cartographer would ink them. This is the biggest visual payoff: ridgelines make the mountains *read* as mountains.

6. **Simple directional shadow** — for each elevation zone, offset a shadow copy slightly SE and draw it as a dark semi-transparent fill. This gives depth without per-pixel normal computation.

7. **Paper texture overlay** — generate a subtle procedural noise texture (very low contrast, ~3-5% opacity) and composite over everything. This gives the "printed on paper" feel. Can be a single small tiled canvas pattern.

8. **Peak markers as illustrated elements** — small triangle/mountain icons at peak positions, not just pins. Draw them as part of the map illustration.

### What to keep from the current implementation

- **`terrainField.ts`** — keep `buildField()` and its multi-peak terrain generation. The topology (peak positions, ridges, valleys, connecting ridgelines) is solid. You're just changing how it's *rendered*, not the underlying data.
- **`topographyMap.ts`** — keep the public API (`createTopographyMap` signature and `TopographyMapApi` return type), the marker creation, the DOM structure, and the interaction setup. Replace the rendering pipeline.
- **`welcomeScreen.ts`** — do NOT modify. It's the orchestrator.
- **`mountains.ts`** — do NOT modify. It's the data source.
- **`style.css`** — update as needed for new visual classes, but preserve the existing layout structure (`.welcome__range-map`, `.welcome__topo`, marker/label classes).

### What to delete

- **`terrainGL.ts`** — delete entirely. The WebGL shader renderer was built for per-pixel hillshading which we're abandoning. The new approach is Canvas 2D only, rendered once. No fragment shaders needed.
- **The per-pixel relief rendering code** in `topographyMap.ts` (`drawReliefC2D`, `buildAO`, `buildShadowMap`, `sampleF`, `sampleBuf`, and the marching-squares contour code). Replace with the new zone-based renderer.

### Interaction model

Keep the current interaction approach but simplify:

- **CSS perspective tilt** on pointer move — keep, it's cheap and effective
- **Parallax** between canvas and overlay — keep
- **Interactive light** — remove (no per-pixel shading means no light to update). The CSS `welcome__topo-light` gradient overlay is fine to keep for a subtle highlight effect.
- **Marker hover** — keep (CSS scale + glow)
- **Reduced motion** — keep (disable tilt, keep static map)

---

## Architecture after the change

```
src/game/
  mountains.ts          — unchanged (mountain data + coordinates)
  welcomeScreen.ts      — unchanged (orchestration)
  topographyMap.ts      — orchestrator: builds field, renders via new pipeline, DOM, interaction
  terrainField.ts       — keep: heightfield generation, peak placement, noise utilities
                          remove: palette (PAL, samplePal, buildPaletteData) — replace with zone colors
  [terrainGL.ts]        — DELETE

New rendering functions (in topographyMap.ts or a new terrainRender.ts helper):
  - quantizeZones(field)       → zone map (Uint8Array, zone index per cell)
  - drawZoneFills(ctx, zones)  → flat-color elevation bands
  - drawContours(ctx, field)   → bold topo contour lines
  - drawRidgeLines(ctx, field) → traced ridge crest strokes
  - drawShadows(ctx, zones)    → offset zone shadows for depth
  - drawPaperTexture(ctx)      → subtle noise overlay
```

---

## Key files and their current state

| File | Lines | What to do |
|------|-------|------------|
| `src/game/topographyMap.ts` | ~435 | Gut rendering code, keep API + markers + interaction |
| `src/game/terrainField.ts` | ~275 | Keep `buildField()`, remove palette exports (or repurpose) |
| `src/game/terrainGL.ts` | ~175 | Delete entirely |
| `src/game/welcomeScreen.ts` | ~109 | Do NOT touch |
| `src/game/mountains.ts` | ~33 | Do NOT touch |
| `src/style.css` | ~360 | Update map-related styles as needed |

### Current public API contract (preserve exactly)

```typescript
// topographyMap.ts
export type TopographyMapApi = {
  updateCounts: (getPlayerLine: (id: string) => string) => void;
  destroy: () => void;
};

export function createTopographyMap(
  host: HTMLElement,
  options: {
    mountains: readonly MountainServerDef[];
    primaryMountainId: string;
    primaryMountainName: string;
    getPlayerLine: (id: string) => string;
  },
): TopographyMapApi;
```

### Mountain coordinate system

Mountains are positioned using `mapXPercent` (0–100, horizontal) and `peakY` (in viewBox space where `SOURCE_VIEWBOX_H = 200`). The marker placement code converts these to CSS percentages:

```typescript
marker.style.left = `${mountain.mapXPercent}%`;
marker.style.top = `${(mountain.peakY / SOURCE_VIEWBOX_H) * 100}%`;
```

The heightfield uses the same coordinates — `mapXPercent / 100` and `peakY / SOURCE_VIEWBOX_H` map to normalized 0–1 field coordinates. Future mountains added to `MOUNTAIN_SERVERS` will automatically get markers and terrain features.

### Canvas dimensions

```typescript
MAP_W = 560;  // canvas pixel width
MAP_H = 308;  // canvas pixel height
FW = 320;     // heightfield grid width
FH = 176;     // heightfield grid height
// Aspect ratio: 20:11 (CSS: aspect-ratio: 20 / 11)
```

---

## Constraints

- **No large binaries.** This is a public repo for a game jam. All art must be procedural or tiny. No sprite sheets, no downloaded tile sets, no image assets.
- **No WebGL in the lobby.** WebGL starts only after the user clicks "Ski." Canvas 2D only for the map.
- **First paint must be fast.** The map renders once on page load. Target <300ms for the full render. No lazy loading, no progressive rendering.
- **Keep the welcome flow intact.** `#range-map-host` → map, server meta line, CTA button, mock player ticker, `onStart({ mountains })` callback. Do not restructure the DOM.
- **Accessibility.** Don't rely on color alone. Important info (peak names, player counts) must be readable through text, contrast, and marker shape. Respect `prefers-reduced-motion`.
- **Multi-mountain ready.** The marker placement system already supports N mountains via `MOUNTAIN_SERVERS`. The terrain already generates multiple peaks. Don't regress this.
- **One concise comment** explaining how map coordinates support future multi-mountain markers (already exists in the marker creation code — preserve it).

---

## Verification

1. `npm run build` must pass (TypeScript strict + Vite production build)
2. `npm run dev` — lobby loads, map renders with distinct illustrated zones
3. Map shows multiple mountain peaks with clear ridgelines, not a noise blob
4. Elevation zones are visually distinct (green valleys → rock → snow peaks)
5. Bold contour lines visible, with brown-on-green and dark-on-snow coloring
6. Pointer movement produces subtle CSS tilt + parallax
7. Frost Giant marker visible with name + player count, responds to hover
8. Player count ticker updates marker text every ~2.8s
9. "Ski Frost Giant" button works → transitions to WebGL play session
10. With `prefers-reduced-motion: reduce` — map renders but no tilt/animation
11. No new files in `public/` or `docs/_local/` — all rendering is procedural

---

## Summary

Stop trying to make procedural noise look like a painting. Use the noise heightfield as a *data source* for elevation zones, then render those zones as flat illustrated bands with bold lines, simple shadows, and a paper texture. The result should look like a stylized topographic map — the kind of map art that makes browser strategy games feel premium. Readable, tactile, cool.
