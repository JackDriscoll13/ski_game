/** Static definitions for mountains on the range map (each ≈ one game server). */

export type MountainServerDef = {
  id: string;
  name: string;
  /** 0–100 from left of the range map viewBox */
  mapXPercent: number;
  /** Peak vertex Y in viewBox space (lower = taller) */
  peakY: number;
  halfWidth: number;
  /** Initial mock player count (updated live on the lobby screen) */
  players: number;
};

/** Shared ground line for peak silhouettes (viewBox 0 0 400 200). */
export const RANGE_BASE_Y = 176;

/** Only lobby server for now — add more entries when you support multiple mountains. */
export const PRIMARY_MOUNTAIN: MountainServerDef = {
  id: "frostgiant",
  name: "Frost Giant",
  mapXPercent: 50,
  peakY: 76,
  halfWidth: 46,
  players: 64,
};

export const MOUNTAIN_SERVERS: readonly MountainServerDef[] = [PRIMARY_MOUNTAIN];

export type SelectedMountain = {
  id: string;
  name: string;
};
